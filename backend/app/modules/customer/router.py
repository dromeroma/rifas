"""Endpoints REST del módulo customer — `/api/v1/customers/*`.

Se registran en `app/main.py` sólo si `perks.admin_api` está ON
(feature flag).

Auth obligatoria: `require_roles(ADMIN, SUPER_ADMIN)` — este panel
NO lo usan vendedores. Tenant scope obligatorio.

En Fase 1 el router es delgado: la lógica vive en `service`.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.customer import Customer as _LegacyCustomer  # deuda: ver README
from app.models.user import User, UserRole
from app.modules.customer import (
    ConsentIn,
    ConsentOut,
    CustomerConsent,
    IdentifyRequest,
    IdentifyResult,
    IdentityConflictError,
    IdentityIn,
    IdentityOut,
    InvalidIdentityValueError,
    PreferenceIn,
    PreferenceOut,
    add_identity,
    get_preferences,
    grant_consent,
    identify,
    list_identities,
    record_consent,
    revoke_consent,
    set_preference,
)
from app.modules.platform.events import Actor, ActorKind
from app.modules.wallet import WalletSnapshot, find, snapshot as wallet_snapshot


router = APIRouter(prefix="/api/v1/customers", tags=["perks-customers"])


# ────────────────────────────────────────────────────────────────
# Responses combinadas
# ────────────────────────────────────────────────────────────────


class CustomerSummary(BaseModel):
    """Fila de la lista — datos mínimos."""

    id: int
    tenant_id: int
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    document: str | None = None
    identities_count: int = 0
    active_vouchers: int = 0


class CustomerDetail(BaseModel):
    """Detalle completo del customer para la vista del admin."""

    id: int
    tenant_id: int
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    document: str | None = None
    identities: list[IdentityOut]
    preferences: list[PreferenceOut]
    recent_consents: list[ConsentOut]


class ListResponse(BaseModel):
    """Envolvente paginado (offset/limit)."""

    items: list[CustomerSummary]
    total: int
    limit: int
    offset: int


def _actor_from_member(member: User) -> Actor:
    return Actor(kind=ActorKind.MEMBER, id=member.id)


def _bad_identity(exc: Exception) -> HTTPException:
    if isinstance(exc, InvalidIdentityValueError):
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_identity",
                "message": str(exc),
                "kind": exc.kind,
            },
        )
    if isinstance(exc, IdentityConflictError):
        return HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "identity_conflict",
                "message": str(exc),
                "existing_customer_id": exc.existing_customer_id,
            },
        )
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ────────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────────


@router.get("", response_model=ListResponse)
async def list_customers(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    q: str | None = Query(default=None, description="Búsqueda por nombre/email/phone/documento (LIKE)"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> ListResponse:
    """Lista customers del tenant con búsqueda simple + paginación."""
    if scope.tenant_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "SUPER_ADMIN debe seleccionar un tenant explícito",
        )

    base = select(_LegacyCustomer).where(_LegacyCustomer.tenant_id == scope.tenant_id)
    if q:
        pattern = f"%{q.strip()}%"
        base = base.where(
            or_(
                _LegacyCustomer.full_name.ilike(pattern),
                _LegacyCustomer.email.ilike(pattern),
                _LegacyCustomer.phone.ilike(pattern),
                _LegacyCustomer.document.ilike(pattern),
            )
        )

    from sqlalchemy import func as sa_func

    total = (
        await db.execute(
            select(sa_func.count()).select_from(base.subquery())
        )
    ).scalar_one()

    rows = list(
        (
            await db.execute(
                base.order_by(_LegacyCustomer.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )

    items = [
        CustomerSummary(
            id=c.id,
            tenant_id=c.tenant_id,
            full_name=c.full_name,
            email=c.email,
            phone=c.phone,
            document=c.document,
        )
        for c in rows
    ]
    return ListResponse(items=items, total=int(total), limit=limit, offset=offset)


async def _load_legacy(
    db: AsyncSession, *, tenant_id: int, customer_id: int,
) -> _LegacyCustomer:
    row = await db.get(_LegacyCustomer, customer_id)
    if row is None or row.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "customer no encontrado")
    return row


@router.get("/{customer_id}", response_model=CustomerDetail)
async def get_customer(
    customer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> CustomerDetail:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")

    legacy = await _load_legacy(
        db, tenant_id=scope.tenant_id, customer_id=customer_id,
    )
    identities = await list_identities(
        db, tenant_id=scope.tenant_id, customer_id=customer_id,
    )
    prefs = await get_preferences(
        db, tenant_id=scope.tenant_id, customer_id=customer_id,
    )
    consents = list(
        (
            await db.execute(
                select(CustomerConsent)
                .where(
                    CustomerConsent.tenant_id == scope.tenant_id,
                    CustomerConsent.customer_id == customer_id,
                )
                .order_by(CustomerConsent.granted_at.desc())
                .limit(20)
            )
        )
        .scalars()
        .all()
    )

    return CustomerDetail(
        id=legacy.id,
        tenant_id=legacy.tenant_id,
        full_name=legacy.full_name,
        email=legacy.email,
        phone=legacy.phone,
        document=legacy.document,
        identities=[IdentityOut.model_validate(i) for i in identities],
        preferences=[PreferenceOut.model_validate(p) for p in prefs],
        recent_consents=[ConsentOut.model_validate(c) for c in consents],
    )


@router.post(
    "/identify",
    response_model=IdentifyResult,
    status_code=status.HTTP_201_CREATED,
)
async def identify_customer(
    payload: IdentifyRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> IdentifyResult:
    """Find-or-create customer por identity."""
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    try:
        result = await identify(
            db,
            tenant_id=scope.tenant_id,
            actor=_actor_from_member(actor),
            request=payload,
        )
    except (InvalidIdentityValueError, IdentityConflictError) as exc:
        raise _bad_identity(exc) from exc
    await db.commit()
    return result


@router.post(
    "/{customer_id}/identities",
    response_model=IdentityOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_customer_identity(
    customer_id: int,
    payload: IdentityIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> IdentityOut:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_legacy(db, tenant_id=scope.tenant_id, customer_id=customer_id)
    try:
        row = await add_identity(
            db,
            tenant_id=scope.tenant_id,
            customer_id=customer_id,
            kind=payload.kind,
            value=payload.value,
            actor=_actor_from_member(actor),
        )
    except (InvalidIdentityValueError, IdentityConflictError) as exc:
        raise _bad_identity(exc) from exc
    await db.commit()
    return IdentityOut.model_validate(row)


@router.post(
    "/{customer_id}/preferences",
    response_model=PreferenceOut,
)
async def upsert_preference(
    customer_id: int,
    payload: PreferenceIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> PreferenceOut:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_legacy(db, tenant_id=scope.tenant_id, customer_id=customer_id)
    row = await set_preference(
        db,
        tenant_id=scope.tenant_id,
        customer_id=customer_id,
        channel=payload.channel,
        allowed=payload.allowed,
        settings=payload.settings,
    )
    await db.commit()
    return PreferenceOut.model_validate(row)


@router.post(
    "/{customer_id}/consents",
    response_model=ConsentOut,
    status_code=status.HTTP_201_CREATED,
)
async def record_customer_consent(
    customer_id: int,
    payload: ConsentIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> ConsentOut:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_legacy(db, tenant_id=scope.tenant_id, customer_id=customer_id)
    row = await record_consent(
        db,
        tenant_id=scope.tenant_id,
        customer_id=customer_id,
        purpose=payload.purpose,
        action=payload.action,
        source=payload.source,
        evidence=payload.evidence,
        policy_version=payload.policy_version,
        notes=payload.notes,
        actor=_actor_from_member(actor),
    )
    await db.commit()
    return ConsentOut.model_validate(row)


@router.get("/{customer_id}/wallet", response_model=WalletSnapshot)
async def get_customer_wallet(
    customer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> WalletSnapshot:
    """Snapshot rico de la wallet del customer.

    Devuelve balances por tipo y conteo de vouchers activos. 404 si
    el customer no existe. 200 con wallet vacía si el customer existe
    pero aún no tiene wallet creada.
    """
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_legacy(db, tenant_id=scope.tenant_id, customer_id=customer_id)

    wallet = await find(
        db, tenant_id=scope.tenant_id, customer_id=customer_id,
    )
    if wallet is None:
        return WalletSnapshot(
            id=0,
            tenant_id=scope.tenant_id,
            customer_id=customer_id,
            balances=[],
            active_vouchers=0,
        )
    return await wallet_snapshot(db, wallet_id=wallet.id)
