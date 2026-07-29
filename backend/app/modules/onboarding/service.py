"""Service del módulo onboarding.

Responsabilidades:
  - Bootstrap idempotente del checklist de un tenant.
  - Marcar steps como completados / skipped / reopenados, con evento.
  - Detección "checklist completo" y emisión única de
    onboarding.tenant.completed.
  - Coordinar activación del tenant delegando en tenant.activate.

Idempotencia:
  Completar un step ya completado es no-op (no re-emite evento).
  Bootstrap múltiples veces no duplica filas — el ON CONFLICT DO NOTHING
  garantiza que una carrera entre GET y POST no crea duplicados.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.modules.onboarding import events as onboarding_events
from app.modules.onboarding.errors import (
    OnboardingStepNotFoundError,
    OnboardingStepUnknownError,
)
from app.modules.onboarding.models import (
    OnboardingStep,
    OnboardingStepStatus,
)
from app.modules.onboarding.schemas import (
    ChecklistOut,
    StepOut,
)
from app.modules.onboarding.steps import (
    DEFAULT_STEPS,
    DEFAULT_STEPS_BY_KEY,
    StepDef,
)
from app.modules.platform.events import Actor, ActorKind, Event, Subject, publish
from app.modules.tenant import (
    TenantProfile,
    TenantStatus,
    activate_tenant,
    get_or_create_profile,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ────────────────────────────────────────────────────────────────
# Bootstrap
# ────────────────────────────────────────────────────────────────


async def _bootstrap(
    db: "AsyncSession", *, tenant_id: int,
) -> list[OnboardingStep]:
    """Asegura una fila por step definido. Idempotente."""
    rows = [
        {
            "tenant_id": tenant_id,
            "step_key": step.key,
            "status": OnboardingStepStatus.PENDING.value,
        }
        for step in DEFAULT_STEPS
    ]
    stmt = (
        pg_insert(OnboardingStep)
        .values(rows)
        .on_conflict_do_nothing(
            index_elements=["tenant_id", "step_key"],
        )
    )
    await db.execute(stmt)
    await db.flush()

    result = await db.execute(
        select(OnboardingStep).where(OnboardingStep.tenant_id == tenant_id)
    )
    return list(result.scalars().all())


async def _load_step(
    db: "AsyncSession", *, tenant_id: int, key: str,
) -> OnboardingStep:
    if key not in DEFAULT_STEPS_BY_KEY:
        raise OnboardingStepUnknownError(key)
    result = await db.execute(
        select(OnboardingStep).where(
            OnboardingStep.tenant_id == tenant_id,
            OnboardingStep.step_key == key,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        # bootstrap on demand — la primera consulta a un step nuevo
        # (por handler auto) puede llegar antes que la primera vista
        # del checklist. Aseguramos la fila.
        await _bootstrap(db, tenant_id=tenant_id)
        result = await db.execute(
            select(OnboardingStep).where(
                OnboardingStep.tenant_id == tenant_id,
                OnboardingStep.step_key == key,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise OnboardingStepNotFoundError(tenant_id, key)
    return row


# ────────────────────────────────────────────────────────────────
# Read
# ────────────────────────────────────────────────────────────────


async def get_checklist(
    db: "AsyncSession", *, tenant_id: int,
) -> ChecklistOut:
    """Snapshot del checklist con agregados. Bootstrap on-demand."""
    rows = await _bootstrap(db, tenant_id=tenant_id)
    by_key = {r.step_key: r for r in rows}

    steps_out: list[StepOut] = []
    total_weight = 0
    done_weight = 0
    completed = 0
    skipped = 0
    pending = 0
    required_missing: list[str] = []

    for defn in DEFAULT_STEPS:
        row = by_key.get(defn.key)
        if row is None:
            continue

        total_weight += defn.weight

        status = row.status
        if status is OnboardingStepStatus.COMPLETED:
            completed += 1
            done_weight += defn.weight
        elif status is OnboardingStepStatus.SKIPPED:
            skipped += 1
            done_weight += defn.weight
        else:
            pending += 1
            if defn.required:
                required_missing.append(defn.key)

        steps_out.append(
            StepOut(
                key=defn.key,
                title=defn.title,
                description=defn.description,
                required=defn.required,
                weight=defn.weight,
                cta=defn.cta,
                status=status,
                completed_at=row.completed_at,
                completed_by=row.completed_by,
                trigger_event_id=row.trigger_event_id,
                meta=row.meta or {},
            )
        )

    profile = await _current_profile(db, tenant_id=tenant_id)
    activated = profile is not None and profile.status is TenantStatus.ACTIVE

    return ChecklistOut(
        tenant_id=tenant_id,
        steps=steps_out,
        total=len(steps_out),
        completed=completed,
        skipped=skipped,
        pending=pending,
        progress=(done_weight / total_weight) if total_weight else 1.0,
        required_missing=required_missing,
        activation_ready=(not required_missing),
        activated=activated,
    )


async def _current_profile(
    db: "AsyncSession", *, tenant_id: int,
) -> TenantProfile | None:
    result = await db.execute(
        select(TenantProfile).where(TenantProfile.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()


# ────────────────────────────────────────────────────────────────
# Transiciones
# ────────────────────────────────────────────────────────────────


async def complete_step(
    db: "AsyncSession",
    *,
    tenant_id: int,
    key: str,
    actor: Actor,
    trigger_event_id: str | None = None,
    meta: dict | None = None,
) -> OnboardingStep:
    """Marca un step como completado. Idempotente."""
    row = await _load_step(db, tenant_id=tenant_id, key=key)

    if row.status is OnboardingStepStatus.COMPLETED:
        return row

    previous_status = row.status
    row.status = OnboardingStepStatus.COMPLETED
    row.completed_at = datetime.now(timezone.utc)
    row.completed_by = _actor_label(actor)
    if trigger_event_id is not None:
        row.trigger_event_id = trigger_event_id
    if meta:
        merged = dict(row.meta or {})
        merged.update(meta)
        row.meta = merged

    await db.flush()

    await publish(
        Event(
            type=onboarding_events.ONBOARDING_STEP_COMPLETED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="onboarding_step", id=row.id),
            data={
                "key": key,
                "previous_status": previous_status.value,
                "trigger_event_id": trigger_event_id,
            },
        ),
        db,
    )

    await _maybe_emit_tenant_completed(db, tenant_id=tenant_id, actor=actor)
    return row


async def skip_step(
    db: "AsyncSession",
    *,
    tenant_id: int,
    key: str,
    actor: Actor,
    reason: str | None = None,
) -> OnboardingStep:
    """Marca un step como skipped (cuenta como completado para activación)."""
    row = await _load_step(db, tenant_id=tenant_id, key=key)

    if row.status is OnboardingStepStatus.SKIPPED:
        return row
    if row.status is OnboardingStepStatus.COMPLETED:
        return row   # ya cumplido, no downgrade

    previous_status = row.status
    row.status = OnboardingStepStatus.SKIPPED
    row.completed_at = datetime.now(timezone.utc)
    row.completed_by = _actor_label(actor)

    await db.flush()

    await publish(
        Event(
            type=onboarding_events.ONBOARDING_STEP_SKIPPED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="onboarding_step", id=row.id),
            data={
                "key": key,
                "previous_status": previous_status.value,
                "reason": reason,
            },
        ),
        db,
    )

    await _maybe_emit_tenant_completed(db, tenant_id=tenant_id, actor=actor)
    return row


async def reopen_step(
    db: "AsyncSession",
    *,
    tenant_id: int,
    key: str,
    actor: Actor,
) -> OnboardingStep:
    """Vuelve un step a PENDING. Usado desde el UI cuando el owner quiere
    re-abrir un paso saltado o marcado por error."""
    row = await _load_step(db, tenant_id=tenant_id, key=key)

    if row.status is OnboardingStepStatus.PENDING:
        return row

    previous_status = row.status
    row.status = OnboardingStepStatus.PENDING
    row.completed_at = None
    row.completed_by = None
    row.trigger_event_id = None

    await db.flush()

    await publish(
        Event(
            type=onboarding_events.ONBOARDING_STEP_REOPENED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="onboarding_step", id=row.id),
            data={
                "key": key,
                "previous_status": previous_status.value,
            },
        ),
        db,
    )
    return row


# ────────────────────────────────────────────────────────────────
# Activación del tenant
# ────────────────────────────────────────────────────────────────


async def request_activation(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
) -> TenantProfile:
    """Punto de entrada del "Go live".

    Evalúa el checklist. Si los required están cumplidos (completed o
    skipped), delega en tenant.activate — que setea status + emite
    tenant.activated. El handler de este mismo módulo escucha ese
    evento y marca el step `go_live` como completado, cerrando el ciclo.
    """
    checklist = await get_checklist(db, tenant_id=tenant_id)

    # go_live siempre está en required_missing hasta que se cumple
    # el propio tenant.activated → filtramos ese para el chequeo
    # (evita el chicken-and-egg).
    blocking = [k for k in checklist.required_missing if k != "go_live"]

    profile = await activate_tenant(
        db,
        tenant_id=tenant_id,
        actor=actor,
        required_completed=(not blocking),
        missing=blocking,
    )
    return profile


# ────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────


async def _maybe_emit_tenant_completed(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
) -> None:
    """Si el checklist quedó completo (required cumplidos), emitir
    onboarding.tenant.completed una sola vez.

    Idempotencia: consultamos el outbox por si ya fue emitido antes.
    Es una consulta barata (índice por tenant_id + type).
    """
    result = await db.execute(
        select(OnboardingStep.status).where(
            OnboardingStep.tenant_id == tenant_id,
        )
    )
    statuses = list(result.scalars().all())
    by_key_status: dict[str, OnboardingStepStatus] = {}
    # Re-fetch con key también para verificar required.
    result2 = await db.execute(
        select(OnboardingStep.step_key, OnboardingStep.status).where(
            OnboardingStep.tenant_id == tenant_id,
        )
    )
    for k, s in result2.all():
        by_key_status[k] = s

    for defn in DEFAULT_STEPS:
        if not defn.required:
            continue
        st = by_key_status.get(defn.key)
        if st not in (
            OnboardingStepStatus.COMPLETED,
            OnboardingStepStatus.SKIPPED,
        ):
            return

    # Idempotency: buscar si ya se emitió el evento por outbox.
    from app.modules.platform.events.models import EventOutbox

    already = await db.execute(
        select(EventOutbox.id).where(
            EventOutbox.tenant_id == tenant_id,
            EventOutbox.type == onboarding_events.ONBOARDING_TENANT_COMPLETED,
        ).limit(1)
    )
    if already.scalar_one_or_none() is not None:
        return

    await publish(
        Event(
            type=onboarding_events.ONBOARDING_TENANT_COMPLETED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="tenant", id=tenant_id),
            data={"steps_total": len(DEFAULT_STEPS)},
        ),
        db,
    )


def _actor_label(actor: Actor) -> str:
    if actor.id is None:
        return actor.kind.value
    return f"{actor.kind.value}:{actor.id}"


__all__ = [
    "complete_step",
    "get_checklist",
    "reopen_step",
    "request_activation",
    "skip_step",
]
