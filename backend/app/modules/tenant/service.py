"""Service del módulo tenant — perfil + activación.

Todas las funciones son async, respetan tenant scoping y publican
eventos al bus cuando cambian estado.

get_or_create_profile — idempotente, crea la fila si no existe.
                        Emite tenant.profile.created solo en creación.
get_profile           — lectura pura, levanta TenantProfileNotFoundError.
update_profile        — patch semántica. Emite tenant.profile.updated
                        con el diff en data.changed.
activate              — set status=ACTIVE + activated_at. Emite
                        tenant.activated. Levanta InvalidActivationError
                        si `required_completed` es False.
pause                 — set status=PAUSED. Emite tenant.paused.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.modules.platform.events import (
    Actor,
    Event,
    Subject,
    publish,
)
from app.modules.tenant import events as tenant_events
from app.modules.tenant.errors import (
    InvalidActivationError,
    TenantProfileNotFoundError,
)
from app.modules.tenant.models import (
    TenantProfile,
    TenantStatus,
)
from app.modules.tenant.schemas import ProfileIn

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ────────────────────────────────────────────────────────────────
# Read
# ────────────────────────────────────────────────────────────────


async def _load_profile(
    db: "AsyncSession", tenant_id: int,
) -> TenantProfile | None:
    result = await db.execute(
        select(TenantProfile).where(TenantProfile.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()


async def get_profile(db: "AsyncSession", tenant_id: int) -> TenantProfile:
    """Devuelve el perfil o levanta si no existe."""
    profile = await _load_profile(db, tenant_id)
    if profile is None:
        raise TenantProfileNotFoundError(tenant_id)
    return profile


# ────────────────────────────────────────────────────────────────
# Bootstrap
# ────────────────────────────────────────────────────────────────


async def get_or_create_profile(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
) -> TenantProfile:
    """Idempotente. Si no existe perfil, lo crea con defaults + evento.

    NO hace commit — caller decide. Retorna la instancia refrescada del
    perfil (existente o recién creado).
    """
    profile = await _load_profile(db, tenant_id)
    if profile is not None:
        return profile

    profile = TenantProfile(tenant_id=tenant_id)
    db.add(profile)
    await db.flush()

    await publish(
        Event(
            type=tenant_events.TENANT_PROFILE_CREATED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="tenant_profile", id=profile.id),
            data={"tenant_id": tenant_id},
        ),
        db,
    )
    return profile


# ────────────────────────────────────────────────────────────────
# Update
# ────────────────────────────────────────────────────────────────


_UPDATABLE_FIELDS = (
    "brand_name",
    "brand_color_primary",
    "brand_color_secondary",
    "brand_logo_url",
    "vertical",
    "timezone",
    "locale",
    "currency",
    "contact_email",
    "contact_phone",
    "support_url",
    "config",
)


async def update_profile(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
    payload: ProfileIn,
) -> TenantProfile:
    """Patch semántica. Solo actualiza campos pasados (excluye None)."""
    profile = await get_or_create_profile(db, tenant_id=tenant_id, actor=actor)

    changes: dict[str, object] = {}
    payload_dict = payload.model_dump(exclude_unset=True)

    for field in _UPDATABLE_FIELDS:
        if field not in payload_dict:
            continue
        new = payload_dict[field]
        old = getattr(profile, field)
        # Enum comparison — comparamos el .value cuando corresponda.
        old_val = old.value if hasattr(old, "value") else old
        new_val = new.value if hasattr(new, "value") else new
        if old_val == new_val:
            continue
        setattr(profile, field, new)
        changes[field] = new_val

    if not changes:
        return profile

    await db.flush()

    await publish(
        Event(
            type=tenant_events.TENANT_PROFILE_UPDATED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="tenant_profile", id=profile.id),
            data={"changed": changes},
        ),
        db,
    )
    return profile


# ────────────────────────────────────────────────────────────────
# Ciclo de vida
# ────────────────────────────────────────────────────────────────


async def activate(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
    required_completed: bool,
    missing: list[str] | None = None,
) -> TenantProfile:
    """Marca el tenant como activo si los prerequisitos están cumplidos.

    El caller (típicamente el módulo onboarding) evalúa si los steps
    obligatorios están completos y pasa `required_completed=True`. Si
    no, este service levanta InvalidActivationError con la lista de
    lo faltante — no hardcodea la lista de steps para mantener bajo
    acoplamiento.

    Idempotente para el evento: si ya estaba activo, no re-emite.
    """
    if not required_completed:
        raise InvalidActivationError(tenant_id, missing or [])

    profile = await get_or_create_profile(db, tenant_id=tenant_id, actor=actor)

    if profile.status is TenantStatus.ACTIVE:
        return profile

    profile.status = TenantStatus.ACTIVE
    profile.activated_at = datetime.now(timezone.utc)
    profile.paused_at = None

    actor_label = None
    if actor.id is not None:
        actor_label = f"{actor.kind.value}:{actor.id}"
    profile.activated_by = actor_label

    await db.flush()

    await publish(
        Event(
            type=tenant_events.TENANT_ACTIVATED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="tenant_profile", id=profile.id),
            data={
                "activated_at": profile.activated_at.isoformat(),
                "activated_by": actor_label,
            },
        ),
        db,
    )
    return profile


async def pause(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
    reason: str | None = None,
) -> TenantProfile:
    """Marca el tenant como pausado. Idempotente."""
    profile = await get_or_create_profile(db, tenant_id=tenant_id, actor=actor)

    if profile.status is TenantStatus.PAUSED:
        return profile

    profile.status = TenantStatus.PAUSED
    profile.paused_at = datetime.now(timezone.utc)

    await db.flush()

    await publish(
        Event(
            type=tenant_events.TENANT_PAUSED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="tenant_profile", id=profile.id),
            data={
                "paused_at": profile.paused_at.isoformat(),
                "reason": reason,
            },
        ),
        db,
    )
    return profile
