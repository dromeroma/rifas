"""
Gestión de cuentas (tenants) — solo super_admin de Boletera.

Endpoints:
  GET    /admin/tenants               lista todas las cuentas con uso real
  POST   /admin/tenants               crea cuenta + admin inicial en una transacción
  GET    /admin/tenants/{id}          detalle de una cuenta
  PATCH  /admin/tenants/{id}          extiende fecha fin, cambia cupo, suspende, etc.
  GET    /admin/tenants/{id}/usage    métricas de uso
"""

import re
from datetime import date
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import SUBSCRIPTION_GRACE_DAYS, require_roles
from app.core.security import hash_password
from app.models.raffle import Raffle
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.schemas.tenant import TenantCreate, TenantOut, TenantUpdate, TenantUsage
from app.services.audit_service import log_action

router = APIRouter(prefix="/admin/tenants", tags=["tenants"])


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return base or "cuenta"


def _subscription_status(t: Tenant) -> str:
    if not t.is_active:
        return "suspended"
    today = date.today()
    if today < t.start_date:
        return "not_started"
    days_over = (today - t.end_date).days
    if days_over <= 0:
        return "active"
    if days_over <= SUBSCRIPTION_GRACE_DAYS:
        return "grace_period"
    return "expired"


async def _usage_for(db: AsyncSession, tenant: Tenant) -> TenantUsage:
    raffles_used = (
        await db.execute(select(func.count(Raffle.id)).where(Raffle.tenant_id == tenant.id))
    ).scalar_one()
    sellers = (
        await db.execute(
            select(func.count(User.id)).where(
                User.tenant_id == tenant.id, User.role == UserRole.SELLER
            )
        )
    ).scalar_one()
    admins = (
        await db.execute(
            select(func.count(User.id)).where(
                User.tenant_id == tenant.id, User.role == UserRole.ADMIN
            )
        )
    ).scalar_one()
    return TenantUsage(
        raffles_used=int(raffles_used or 0),
        raffles_max=tenant.max_raffles,
        sellers_count=int(sellers or 0),
        admins_count=int(admins or 0),
    )


async def _tenant_out(db: AsyncSession, tenant: Tenant) -> TenantOut:
    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        start_date=tenant.start_date,
        end_date=tenant.end_date,
        max_raffles=tenant.max_raffles,
        is_active=tenant.is_active,
        billing_email=tenant.billing_email,
        billing_phone=tenant.billing_phone,
        notes=tenant.notes,
        usage=await _usage_for(db, tenant),
        subscription_status=_subscription_status(tenant),
    )


@router.get("", response_model=List[TenantOut])
async def list_tenants(
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    tenants = (await db.execute(select(Tenant).order_by(Tenant.id.desc()))).scalars().all()
    return [await _tenant_out(db, t) for t in tenants]


@router.post("", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    payload: TenantCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    """Crea la cuenta y su admin inicial en una sola operación."""
    # Resolver slug
    slug = payload.slug or _slugify(payload.name)
    if (await db.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none():
        # Si choca, intentamos sufijo con id futuro (suficiente para una cuenta nueva)
        slug = f"{slug}-{int(date.today().strftime('%Y%m%d'))}"

    # Email único entre todos los usuarios
    if (
        await db.execute(select(User).where(User.email == payload.admin_email))
    ).scalar_one_or_none():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"ya existe un usuario con el email {payload.admin_email}",
        )

    tenant = Tenant(
        name=payload.name,
        slug=slug,
        start_date=payload.start_date,
        end_date=payload.end_date,
        max_raffles=payload.max_raffles,
        is_active=True,
        billing_email=payload.billing_email,
        billing_phone=payload.billing_phone,
        notes=payload.notes,
    )
    db.add(tenant)
    await db.flush()

    admin = User(
        email=payload.admin_email,
        full_name=payload.admin_full_name,
        password_hash=hash_password(payload.admin_password),
        role=UserRole.ADMIN,
        phone=payload.admin_phone,
        is_active=True,
        tenant_id=tenant.id,
    )
    db.add(admin)

    await log_action(
        db, actor_id=actor.id, action="tenant.create",
        entity_type="tenant", entity_id=tenant.id, request=request,
        metadata={
            "slug": tenant.slug,
            "max_raffles": tenant.max_raffles,
            "admin_email": payload.admin_email,
        },
    )
    await db.commit()
    await db.refresh(tenant)
    return await _tenant_out(db, tenant)


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cuenta no encontrada")
    return await _tenant_out(db, tenant)


@router.patch("/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cuenta no encontrada")

    data = payload.model_dump(exclude_unset=True)

    # Validación: end_date no puede ser anterior a start_date efectiva
    new_start = data.get("start_date", tenant.start_date)
    new_end = data.get("end_date", tenant.end_date)
    if new_end < new_start:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "end_date no puede ser anterior a start_date.",
        )

    # Validación: bajar max_raffles por debajo de las ya creadas no se permite
    if "max_raffles" in data:
        used = (
            await db.execute(select(func.count(Raffle.id)).where(Raffle.tenant_id == tenant.id))
        ).scalar_one()
        if int(used or 0) > data["max_raffles"]:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"no puedes reducir el cupo por debajo de {used} (rifas ya creadas).",
            )

    for k, v in data.items():
        setattr(tenant, k, v)

    await log_action(
        db, actor_id=actor.id, action="tenant.update",
        entity_type="tenant", entity_id=tenant.id, request=request,
        metadata=payload.model_dump(exclude_unset=True, mode="json"),
    )
    await db.commit()
    await db.refresh(tenant)
    return await _tenant_out(db, tenant)


@router.get("/{tenant_id}/usage", response_model=TenantUsage)
async def tenant_usage(
    tenant_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cuenta no encontrada")
    return await _usage_for(db, tenant)
