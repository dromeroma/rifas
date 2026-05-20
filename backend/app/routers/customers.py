from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.customer import Customer
from app.models.ticket import Ticket
from app.models.user import User, UserRole
from app.schemas.customer import CustomerCreate, CustomerOut
from app.services.audit_service import log_action

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=List[CustomerOut])
async def list_customers(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    q: str | None = Query(default=None, description="búsqueda por nombre, documento o teléfono"),
    mine: bool = Query(
        default=False,
        description="Si es vendedor, devuelve solo los clientes con boletas reservadas/vendidas por él",
    ),
):
    query = select(Customer).order_by(Customer.id.desc())

    # Un vendedor con mine=true ve "sus clientes": tanto los que él registró
    # (created_by_user_id == su id) como aquellos a los que les ha reservado
    # o vendido al menos una boleta.
    if mine and actor.role == UserRole.SELLER:
        has_my_ticket = exists().where(
            Ticket.customer_id == Customer.id,
            Ticket.seller_id == actor.id,
        )
        query = query.where(
            or_(Customer.created_by_user_id == actor.id, has_my_ticket)
        )

    if q:
        pat = f"%{q}%"
        query = query.where(
            or_(
                Customer.full_name.ilike(pat),
                Customer.document.ilike(pat),
                Customer.phone.ilike(pat),
            )
        )
    return (await db.execute(query.limit(100))).scalars().all()


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
    customer = Customer(**payload.model_dump(), created_by_user_id=actor.id)
    db.add(customer)
    await db.flush()
    await log_action(
        db, actor_id=actor.id, action="customer.create",
        entity_type="customer", entity_id=customer.id, request=request,
        metadata={"phone": customer.phone, "created_by_role": actor.role.value},
    )
    await db.commit()
    await db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
    c = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cliente no encontrado")
    return c
