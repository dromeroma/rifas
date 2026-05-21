from dataclasses import dataclass
from datetime import date, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.tenant import Tenant
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Días de gracia después de end_date durante los cuales el tenant queda
# en modo solo-lectura antes del bloqueo total.
SUBSCRIPTION_GRACE_DAYS = 7


@dataclass
class TenantScope:
    """Contexto multi-tenant resuelto a partir del usuario autenticado.

    - tenant_id: id del tenant del usuario. None para super_admin global.
    - is_super_admin: shortcut.
    - tenant: el objeto Tenant cargado (None para super_admin).
    - subscription_status: "active" | "grace_period" | "expired" | None (super).
    - read_only: True si está en grace_period (no permite mutaciones).
    """
    tenant_id: int | None
    is_super_admin: bool
    tenant: Tenant | None
    subscription_status: str | None
    read_only: bool


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token inválido")

    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "tipo de token inválido")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token sin sujeto")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "usuario no encontrado o inactivo")
    return user


def require_roles(*roles: UserRole):
    async def _checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "permiso denegado")
        return user
    return _checker


async def get_tenant_scope(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TenantScope:
    """Resuelve el contexto de tenant del usuario y aplica las reglas de
    suscripción: activa, periodo de gracia (read-only) o expirado (bloquea).

    El super_admin global (tenant_id NULL) tiene acceso total sin restricciones.
    """
    # Super admin global: sin tenant, sin restricciones.
    if user.tenant_id is None:
        return TenantScope(
            tenant_id=None,
            is_super_admin=user.role == UserRole.SUPER_ADMIN,
            tenant=None,
            subscription_status=None,
            read_only=False,
        )

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "cuenta no encontrada")
    if not tenant.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "cuenta suspendida. Contacta al equipo de Boletera.",
        )

    today = date.today()
    if today < tenant.start_date:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"la suscripción de tu cuenta inicia el {tenant.start_date.isoformat()}.",
        )

    days_overdue = (today - tenant.end_date).days
    if days_overdue <= 0:
        status_str = "active"
        read_only = False
    elif days_overdue <= SUBSCRIPTION_GRACE_DAYS:
        status_str = "grace_period"
        read_only = True
    else:
        # Expirada más allá del periodo de gracia: bloqueo total.
        # Solo permitimos GET a /auth/me para que el frontend pueda mostrar
        # la pantalla de suscripción vencida.
        if not (request.method == "GET" and request.url.path.endswith("/auth/me")):
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                {
                    "code": "subscription_expired",
                    "message": "tu suscripción venció hace más de 7 días. Renueva para continuar.",
                    "end_date": tenant.end_date.isoformat(),
                },
            )
        status_str = "expired"
        read_only = True

    # En grace_period, solo bloqueamos mutaciones (POST/PATCH/PUT/DELETE).
    if status_str == "grace_period" and request.method.upper() in ("POST", "PATCH", "PUT", "DELETE"):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            {
                "code": "subscription_grace_period",
                "message": (
                    "tu suscripción venció. Tienes 7 días de gracia en modo solo-lectura. "
                    f"Renueva antes del {(tenant.end_date + timedelta(days=SUBSCRIPTION_GRACE_DAYS)).isoformat()}."
                ),
                "end_date": tenant.end_date.isoformat(),
            },
        )

    return TenantScope(
        tenant_id=tenant.id,
        is_super_admin=False,
        tenant=tenant,
        subscription_status=status_str,
        read_only=read_only,
    )


def assert_tenant_owns(scope: TenantScope, entity_tenant_id: int | None) -> None:
    """Lanza 404 si un usuario con tenant intenta tocar una entidad de otro
    tenant. El super_admin global pasa siempre.
    """
    if scope.tenant_id is None:
        return
    if entity_tenant_id != scope.tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no encontrado")
