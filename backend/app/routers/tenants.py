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

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import SUBSCRIPTION_GRACE_DAYS, require_roles
from app.core.security import hash_password
from app.models.raffle import Raffle
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.schemas.tenant import TenantCreate, TenantOut, TenantUpdate, TenantUsage
from app.services.audit_service import log_action
from app.services.email_service import send_tenant_pre_expiry_email

_settings = get_settings()

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

    # Si se extiende end_date hacia el futuro, reiniciar el ciclo de
    # notificaciones pre-vencimiento (de lo contrario nunca volvería a avisar).
    if "end_date" in data and data["end_date"] > tenant.end_date:
        tenant.last_pre_expiry_notification_days = None

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


class PreExpiryResult(BaseModel):
    checked: int
    notified: int
    notifications: list[dict]


PRE_EXPIRY_THRESHOLDS = [7, 3, 1]


def _is_cron_request(request: Request) -> bool:
    secret = _settings.cron_secret
    if not secret:
        return False
    header_secret = request.headers.get("x-cron-secret") or request.headers.get("X-Cron-Secret")
    return header_secret == secret


@router.post("/check-expirations", response_model=PreExpiryResult)
async def check_expirations(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    _x_cron_secret: Annotated[str | None, Header(alias="X-Cron-Secret")] = None,
):
    """Recorre todos los tenants activos y envía notificaciones de
    pre-vencimiento (7, 3, 1 día(s) antes de end_date). Idempotente vía
    `last_pre_expiry_notification_days`: no duplica recordatorios.

    Autenticación: header X-Cron-Secret con CRON_SECRET, O bien JWT de
    super_admin. Pensado para llamarse desde Render Cron diariamente.
    """
    # Auth: cron secret OR super_admin
    if not _is_cron_request(request):
        # Fallback a JWT super_admin
        from app.core.deps import get_current_user
        # Validamos manualmente: si no hay token o no es super_admin → 403
        from app.core.security import decode_token
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "se requiere super_admin o X-Cron-Secret")
        try:
            payload = decode_token(auth[7:])
            user_id = int(payload["sub"])
        except Exception:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token inválido")
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user or user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "solo super_admin")

    today = date.today()
    tenants = (
        await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))
    ).scalars().all()

    checked = 0
    notified = 0
    notifications: list[dict] = []

    for t in tenants:
        checked += 1
        days_left = (t.end_date - today).days
        if days_left < 0:
            continue  # ya venció; ese caso se maneja con block + email aparte

        # Encontrar el threshold más bajo que aún no notificamos.
        # Si days_left=5: threshold pendiente es 3 (porque 5 >= 3) si no se ha
        # notificado nunca. Si ya notificamos 7, ahora notificamos 3 cuando
        # days_left <= 3.
        target: int | None = None
        for th in PRE_EXPIRY_THRESHOLDS:
            if days_left <= th and (
                t.last_pre_expiry_notification_days is None
                or t.last_pre_expiry_notification_days > th
            ):
                target = th
                break

        if target is None:
            continue

        # Resolver destinatario: billing_email si existe, sino email del primer admin
        to_email = t.billing_email
        admin_name = t.name
        if not to_email:
            admin = (
                await db.execute(
                    select(User).where(
                        User.tenant_id == t.id, User.role == UserRole.ADMIN
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if admin:
                to_email = admin.email
                admin_name = admin.full_name

        if not to_email:
            notifications.append({"tenant_id": t.id, "threshold": target, "status": "no_email"})
            continue

        try:
            ok = await send_tenant_pre_expiry_email(
                to_email=to_email,
                admin_name=admin_name,
                tenant_name=t.name,
                days_left=days_left,
                end_date=t.end_date.isoformat(),
                renew_contact_email=_settings.admin_notify_email or "soporte@boletera.app",
            )
        except Exception:
            ok = False

        if ok:
            t.last_pre_expiry_notification_days = target
            notified += 1
            notifications.append({
                "tenant_id": t.id, "name": t.name, "to": to_email,
                "days_left": days_left, "threshold": target, "status": "sent",
            })
            await log_action(
                db, actor_id=None, action="tenant.pre_expiry_notify",
                entity_type="tenant", entity_id=t.id, request=request,
                metadata={"days_left": days_left, "threshold": target},
            )
        else:
            notifications.append({
                "tenant_id": t.id, "threshold": target, "status": "send_failed",
            })

    await db.commit()
    return PreExpiryResult(checked=checked, notified=notified, notifications=notifications)


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
