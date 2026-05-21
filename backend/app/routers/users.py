from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_tenant_scope, require_roles
from app.core.security import hash_password
from app.models.commission import Commission
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User, UserRole
from app.schemas.user import SellerSummary, UserCreate, UserOut, UserUpdate
from app.services.audit_service import log_action

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[UserOut])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    role: Optional[UserRole] = Query(default=None),
    active: Optional[bool] = Query(default=None),
):
    q = select(User).order_by(User.id.desc())
    if scope.tenant_id is not None:
        # Tenant admin solo ve usuarios de su propio tenant.
        q = q.where(User.tenant_id == scope.tenant_id)
    if role is not None:
        q = q.where(User.role == role)
    if active is not None:
        q = q.where(User.is_active == active)
    return (await db.execute(q)).scalars().all()


@router.get("/sellers/summary", response_model=List[SellerSummary])
async def sellers_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    raffle_id: Optional[int] = Query(default=None, description="Si se pasa, filtra stats a esa rifa"),
):
    """Lista de vendedores con métricas reales agregadas:
      - paid_tickets: boletas pagadas (PAID + WINNING) del vendedor
      - commission_total: suma de Commission.amount del vendedor
      - commission_paid: suma de Commission.amount donde paid=True
      - commission_pending: suma de Commission.amount donde paid=False
      - default_commission: valor por defecto configurado al crear el usuario
    """
    sellers_q = select(User).where(User.role == UserRole.SELLER).order_by(User.id.desc())
    if scope.tenant_id is not None:
        sellers_q = sellers_q.where(User.tenant_id == scope.tenant_id)
    sellers = (await db.execute(sellers_q)).scalars().all()
    if not sellers:
        return []

    ticket_q = (
        select(
            Ticket.seller_id,
            func.count(Ticket.id).label("paid"),
        )
        .where(Ticket.status.in_([TicketStatus.PAID, TicketStatus.WINNING]))
        .group_by(Ticket.seller_id)
    )
    com_q = (
        select(
            Commission.seller_id,
            func.coalesce(func.sum(Commission.amount), 0).label("total"),
            func.coalesce(
                func.sum(
                    case((Commission.paid.is_(True), Commission.amount), else_=0)
                ),
                0,
            ).label("paid_total"),
        )
        .group_by(Commission.seller_id)
    )
    if raffle_id is not None:
        ticket_q = ticket_q.where(Ticket.raffle_id == raffle_id)
        com_q = com_q.where(Commission.raffle_id == raffle_id)

    paid_by_seller = {row.seller_id: int(row.paid) for row in (await db.execute(ticket_q)).all()}
    com_by_seller = {
        row.seller_id: (float(row.total or 0), float(row.paid_total or 0))
        for row in (await db.execute(com_q)).all()
    }

    out: List[SellerSummary] = []
    for s in sellers:
        total, paid_total = com_by_seller.get(s.id, (0.0, 0.0))
        out.append(
            SellerSummary(
                id=s.id,
                email=s.email,
                full_name=s.full_name,
                phone=s.phone,
                is_active=s.is_active,
                default_commission=s.default_commission,
                paid_tickets=paid_by_seller.get(s.id, 0),
                commission_total=total,
                commission_paid=paid_total,
                commission_pending=max(total - paid_total, 0),
            )
        )
    return out


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "ya existe un usuario con ese email")

    # Tenant del nuevo usuario:
    # - admin de un tenant: solo puede crear usuarios de su propio tenant
    # - super_admin: para crear super_admins usa tenant_id=None, pero por ahora
    #   solo se pueden crear sellers/admins desde este endpoint y siempre
    #   requieren tenant_id (usa el endpoint /admin/tenants para crear
    #   el admin inicial de una cuenta junto con el tenant).
    if scope.tenant_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "los usuarios deben crearse desde el contexto de una cuenta. "
            "Para crear una nueva cuenta y su admin, usa POST /admin/tenants.",
        )
    new_tenant_id = scope.tenant_id

    # admin de un tenant no puede crear super_admins
    if payload.role == UserRole.SUPER_ADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "no autorizado para crear super_admin",
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        phone=payload.phone,
        default_commission=payload.default_commission,
        is_active=True,
        tenant_id=new_tenant_id,
    )
    db.add(user)
    await db.flush()
    await log_action(
        db, actor_id=actor.id, action="user.create",
        entity_type="user", entity_id=user.id, request=request,
        metadata={"email": user.email, "role": user.role.value},
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "usuario no encontrado")
    assert_tenant_owns(scope, user.tenant_id)

    data = payload.model_dump(exclude_unset=True)
    if (pw := data.pop("password", None)):
        user.password_hash = hash_password(pw)
    for k, v in data.items():
        setattr(user, k, v)

    await log_action(
        db, actor_id=actor.id, action="user.update",
        entity_type="user", entity_id=user.id, request=request,
        metadata={k: v for k, v in data.items() if k != "password"},
    )
    await db.commit()
    await db.refresh(user)
    return user
