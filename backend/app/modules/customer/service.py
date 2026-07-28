"""Service del módulo customer — lógica pura de dominio.

Superficie pública:

  find_by_identity(db, tenant_id, kind, value) -> customer_id | None
      Búsqueda por identity match. Devuelve solo el id (evita cargar
      todo el customer si el caller no lo necesita).

  add_identity(db, tenant_id, customer_id, kind, value, ...) -> CustomerIdentity
      Registra una nueva identity contra un customer existente. Falla
      si la identity ya pertenece a otro customer distinto.

  verify_identity(db, identity_id, source) -> CustomerIdentity
      Marca identity como verificada + publica evento.

  identify(db, tenant_id, actor, request) -> IdentifyResult
      Find-or-create: si la identity primaria ya existe → devuelve
      su customer. Si no → crea customer nuevo (tabla `customers`
      legacy, deuda documentada abajo) + registra identity + publica
      `customer.identified`.

  set_preference(db, tenant_id, customer_id, channel, allowed, settings)
      Upsert de preferencia por canal.

  grant_consent / revoke_consent (db, tenant_id, customer_id, purpose, ...)
      Append-only. Publica evento correspondiente.


Deuda técnica activa durante Fase 1:
  `identify` crea customers en la tabla `customers` legacy (usada
  también por el flujo actual de rifas). Esto mantiene la
  compatibilidad hasta el cutover post-4-ago-2026. Post-cutover, el
  módulo customer será fuente de verdad y `customers` pasará a
  gestionarse solo desde aquí. Import de `Customer` legacy queda
  explícito para que sea trivial retirar.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

# Import de compat con el legacy — se retira post-cutover.
from app.models.customer import Customer as _LegacyCustomer
from app.modules.customer.errors import (
    IdentityConflictError,
    InvalidIdentityValueError,
)
from app.modules.customer.events import (
    CUSTOMER_CONSENT_GRANTED,
    CUSTOMER_CONSENT_REVOKED,
    CUSTOMER_IDENTIFIED,
    CUSTOMER_IDENTITY_ADDED,
    CUSTOMER_IDENTITY_VERIFIED,
)
from app.modules.customer.models import (
    ConsentAction,
    CustomerConsent,
    CustomerIdentity,
    CustomerPreference,
    IdentityKind,
    NotificationChannel,
)
from app.modules.customer.schemas import (
    IdentifyRequest,
    IdentifyResult,
    IdentityOut,
)
from app.modules.platform.events import (
    Actor,
    ActorKind,
    Event,
    EventContext,
    Subject,
    publish,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ────────────────────────────────────────────────────────────────
# Normalización de valores de identity
# ────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_identity(kind: IdentityKind, value: str) -> str:
    """Aplica reglas de normalización por tipo — se usa para unicidad
    y para búsqueda tolerante a variaciones tipográficas."""
    if not value or not isinstance(value, str):
        raise InvalidIdentityValueError(kind.value, str(value), "valor vacío")

    v = value.strip()
    if kind is IdentityKind.EMAIL:
        v = v.lower()
        if not _EMAIL_RE.match(v):
            raise InvalidIdentityValueError(kind.value, value, "email inválido")
        return v
    if kind is IdentityKind.PHONE:
        digits = re.sub(r"[^0-9]", "", v)
        if len(digits) < 7:
            raise InvalidIdentityValueError(kind.value, value, "menos de 7 dígitos")
        # Convención LATAM: si empieza con 3 y tiene 10 dígitos → asumimos CO.
        # No forzamos código de país porque el tenant puede ser de otro país;
        # dejamos la normalización real al service de identity de plataforma
        # cuando exista. Por ahora normalizamos a solo dígitos.
        return digits
    if kind is IdentityKind.DOCUMENT:
        d = re.sub(r"[\s\-\.]", "", v)
        if not d:
            raise InvalidIdentityValueError(kind.value, value, "documento vacío")
        return d.upper()
    if kind is IdentityKind.EXTERNAL:
        if not v:
            raise InvalidIdentityValueError(kind.value, value, "external_id vacío")
        return v
    raise InvalidIdentityValueError(kind.value, value, f"kind desconocido: {kind}")


# ────────────────────────────────────────────────────────────────
# Queries
# ────────────────────────────────────────────────────────────────


async def find_by_identity(
    db: "AsyncSession",
    *,
    tenant_id: int,
    kind: IdentityKind,
    value: str,
) -> int | None:
    """Devuelve customer_id si (tenant, kind, value) matchea una
    identity registrada; None en caso contrario."""
    norm = _normalize_identity(kind, value)
    stmt = select(CustomerIdentity.customer_id).where(
        CustomerIdentity.tenant_id == tenant_id,
        CustomerIdentity.kind == kind,
        CustomerIdentity.value_normalized == norm,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _find_identity(
    db: "AsyncSession",
    *,
    tenant_id: int,
    kind: IdentityKind,
    value_normalized: str,
) -> CustomerIdentity | None:
    stmt = select(CustomerIdentity).where(
        CustomerIdentity.tenant_id == tenant_id,
        CustomerIdentity.kind == kind,
        CustomerIdentity.value_normalized == value_normalized,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_identities(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
) -> list[CustomerIdentity]:
    """Lista identities del customer, orden estable por kind + id."""
    stmt = (
        select(CustomerIdentity)
        .where(
            CustomerIdentity.tenant_id == tenant_id,
            CustomerIdentity.customer_id == customer_id,
        )
        .order_by(CustomerIdentity.kind.asc(), CustomerIdentity.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


# ────────────────────────────────────────────────────────────────
# Mutaciones — identities
# ────────────────────────────────────────────────────────────────


async def add_identity(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    kind: IdentityKind,
    value: str,
    actor: Actor,
    verified: bool = False,
    verification_source: str | None = None,
    source: str | None = None,
    trigger_event_id: str | None = None,
) -> CustomerIdentity:
    """Agrega una identity al customer. Publica `customer.identity.added`.

    Idempotente: si la identity ya pertenece a este mismo customer,
    devuelve la existente sin crear duplicado ni emitir evento.
    Levanta IdentityConflictError si ya pertenece a otro.
    """
    norm = _normalize_identity(kind, value)

    existing = await _find_identity(
        db, tenant_id=tenant_id, kind=kind, value_normalized=norm,
    )
    if existing is not None:
        if existing.customer_id == customer_id:
            return existing
        raise IdentityConflictError(
            tenant_id=tenant_id,
            kind=kind.value,
            value=value,
            existing_customer_id=existing.customer_id,
            attempted_customer_id=customer_id,
        )

    now = datetime.now(timezone.utc)
    identity = CustomerIdentity(
        tenant_id=tenant_id,
        customer_id=customer_id,
        kind=kind,
        value=value.strip(),
        value_normalized=norm,
        verified=verified,
        verified_at=now if verified else None,
        verification_source=verification_source if verified else None,
        source=source,
    )
    db.add(identity)
    await db.flush()

    await publish(
        Event(
            type=CUSTOMER_IDENTITY_ADDED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="customer", id=customer_id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "identity_id": identity.id,
                "kind": kind.value,
                "verified": verified,
                "source": source,
            },
        ),
        db,
    )
    return identity


async def verify_identity(
    db: "AsyncSession",
    *,
    identity: CustomerIdentity,
    source: str,
    actor: Actor,
    trigger_event_id: str | None = None,
) -> CustomerIdentity:
    """Marca la identity como verificada + publica evento.

    Idempotente: si ya está verificada, no emite evento repetido."""
    if identity.verified:
        return identity

    identity.verified = True
    identity.verified_at = datetime.now(timezone.utc)
    identity.verification_source = source

    await publish(
        Event(
            type=CUSTOMER_IDENTITY_VERIFIED,
            tenant_id=identity.tenant_id,
            actor=actor,
            subject=Subject(kind="customer", id=identity.customer_id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "identity_id": identity.id,
                "kind": identity.kind.value,
                "source": source,
            },
        ),
        db,
    )
    return identity


# ────────────────────────────────────────────────────────────────
# identify — find-or-create
# ────────────────────────────────────────────────────────────────


async def identify(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
    request: IdentifyRequest,
    trigger_event_id: str | None = None,
) -> IdentifyResult:
    """Reconoce (o crea) un customer por su identity primaria.

    Flujo:
      1. Normaliza la identity primaria.
      2. Busca match en customer_identities.
      3. Si existe → asegura identities adicionales (crea las que
         falten sobre el mismo customer). first_time=False. NO emite
         customer.identified (el customer ya era conocido).
      4. Si no existe → crea Customer en la tabla legacy con full_name.
         Registra identity primaria + adicionales. Emite
         customer.identified con first_time=True.

    Todas las operaciones ocurren en la transacción del `db`. El
    llamante decide el commit.
    """
    primary_kind = request.identity.kind
    primary_value = request.identity.value
    primary_norm = _normalize_identity(primary_kind, primary_value)

    existing_identity = await _find_identity(
        db, tenant_id=tenant_id, kind=primary_kind, value_normalized=primary_norm,
    )

    first_time = existing_identity is None
    if existing_identity is not None:
        customer_id = existing_identity.customer_id
    else:
        customer_id = await _create_legacy_customer(
            db,
            tenant_id=tenant_id,
            full_name=request.full_name,
            primary_kind=primary_kind,
            primary_value=primary_value.strip(),
        )
        # Registrar identity primaria contra el customer nuevo.
        primary = CustomerIdentity(
            tenant_id=tenant_id,
            customer_id=customer_id,
            kind=primary_kind,
            value=primary_value.strip(),
            value_normalized=primary_norm,
            source=request.source,
        )
        db.add(primary)
        await db.flush()

    # Adicionales — crear las que falten, saltear las ya existentes en
    # este customer, fallar limpiamente si chocan con otro.
    for extra in request.additional_identities:
        try:
            await add_identity(
                db,
                tenant_id=tenant_id,
                customer_id=customer_id,
                kind=extra.kind,
                value=extra.value,
                actor=actor,
                source=request.source,
                trigger_event_id=trigger_event_id,
            )
        except IdentityConflictError:
            # No abortamos toda la operación — el conflicto sube al
            # llamante que decide qué hacer con la identity que
            # pertenece a otro customer. Re-raise limpio.
            raise

    if first_time:
        await publish(
            Event(
                type=CUSTOMER_IDENTIFIED,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="customer", id=customer_id),
                context=EventContext(trigger_event_id=trigger_event_id),
                data={
                    "first_time": True,
                    "primary_identity_kind": primary_kind.value,
                    "source": request.source,
                },
            ),
            db,
        )

    identities = await list_identities(
        db, tenant_id=tenant_id, customer_id=customer_id,
    )
    return IdentifyResult(
        customer_id=customer_id,
        first_time=first_time,
        identities=[IdentityOut.model_validate(i) for i in identities],
    )


async def _create_legacy_customer(
    db: "AsyncSession",
    *,
    tenant_id: int,
    full_name: str | None,
    primary_kind: IdentityKind,
    primary_value: str,
) -> int:
    """Crea un Customer en la tabla legacy y devuelve su id.

    Mientras dure la deuda documentada arriba, este helper es el ÚNICO
    lugar del módulo que toca el modelo legacy. Cuando se retire, esta
    función se reemplaza por creación en el propio módulo customer.
    """
    kwargs = {"tenant_id": tenant_id, "full_name": (full_name or "").strip() or "—"}
    if primary_kind is IdentityKind.EMAIL:
        kwargs["email"] = primary_value.lower()
    elif primary_kind is IdentityKind.PHONE:
        kwargs["phone"] = primary_value
    elif primary_kind is IdentityKind.DOCUMENT:
        kwargs["document"] = primary_value

    row = _LegacyCustomer(**kwargs)
    db.add(row)
    await db.flush()
    return row.id


# ────────────────────────────────────────────────────────────────
# Preferences
# ────────────────────────────────────────────────────────────────


async def set_preference(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    channel: NotificationChannel,
    allowed: bool,
    settings: dict | None = None,
) -> CustomerPreference:
    """Upsert de la preferencia por canal."""
    values = {
        "tenant_id": tenant_id,
        "customer_id": customer_id,
        "channel": channel,
        "allowed": allowed,
        "settings": settings or {},
    }
    stmt = pg_insert(CustomerPreference).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["tenant_id", "customer_id", "channel"],
        set_={"allowed": allowed, "settings": settings or {}},
    ).returning(CustomerPreference)
    return (await db.execute(stmt)).scalar_one()


async def get_preferences(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
) -> list[CustomerPreference]:
    stmt = (
        select(CustomerPreference)
        .where(
            CustomerPreference.tenant_id == tenant_id,
            CustomerPreference.customer_id == customer_id,
        )
        .order_by(CustomerPreference.channel.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


# ────────────────────────────────────────────────────────────────
# Consents (append-only)
# ────────────────────────────────────────────────────────────────


async def record_consent(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    purpose: str,
    action: ConsentAction,
    source: str,
    evidence: dict | None = None,
    policy_version: str | None = None,
    notes: str | None = None,
    actor: Actor,
    trigger_event_id: str | None = None,
) -> CustomerConsent:
    """Registra un consent en append-only y publica el evento."""
    row = CustomerConsent(
        tenant_id=tenant_id,
        customer_id=customer_id,
        purpose=purpose,
        action=action,
        source=source,
        evidence=evidence or {},
        policy_version=policy_version,
        notes=notes,
    )
    db.add(row)
    await db.flush()

    event_type = (
        CUSTOMER_CONSENT_GRANTED if action is ConsentAction.GRANTED
        else CUSTOMER_CONSENT_REVOKED
    )
    await publish(
        Event(
            type=event_type,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="customer", id=customer_id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "purpose": purpose,
                "source": source,
                "policy_version": policy_version,
            },
        ),
        db,
    )
    return row


async def latest_consent(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    purpose: str,
) -> CustomerConsent | None:
    """Devuelve el último consent registrado para este purpose."""
    stmt = (
        select(CustomerConsent)
        .where(
            CustomerConsent.tenant_id == tenant_id,
            CustomerConsent.customer_id == customer_id,
            CustomerConsent.purpose == purpose,
        )
        .order_by(CustomerConsent.granted_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


# Convenience: helpers ergonómicos por action
async def grant_consent(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    purpose: str,
    source: str,
    evidence: dict | None = None,
    policy_version: str | None = None,
    notes: str | None = None,
    actor: Actor | None = None,
) -> CustomerConsent:
    return await record_consent(
        db,
        tenant_id=tenant_id,
        customer_id=customer_id,
        purpose=purpose,
        action=ConsentAction.GRANTED,
        source=source,
        evidence=evidence,
        policy_version=policy_version,
        notes=notes,
        actor=actor or Actor(kind=ActorKind.SYSTEM),
    )


async def revoke_consent(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    purpose: str,
    source: str,
    evidence: dict | None = None,
    notes: str | None = None,
    actor: Actor | None = None,
) -> CustomerConsent:
    return await record_consent(
        db,
        tenant_id=tenant_id,
        customer_id=customer_id,
        purpose=purpose,
        action=ConsentAction.REVOKED,
        source=source,
        evidence=evidence,
        notes=notes,
        actor=actor or Actor(kind=ActorKind.SYSTEM),
    )
