"""Asignación de bloques de boletas a vendedores."""

from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_tenant_scope, require_roles
from app.models.raffle import Raffle
from app.models.seller_assignment import SellerAssignment
from app.models.ticket import Ticket
from app.models.user import User, UserRole
from app.schemas.user import SellerAssignmentCreate, SellerAssignmentOut
from app.services.audit_service import log_action

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("", response_model=List[SellerAssignmentOut])
async def list_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    raffle_id: int | None = None,
    seller_id: int | None = None,
):
    q = (
        select(SellerAssignment)
        .join(Raffle, Raffle.id == SellerAssignment.raffle_id)
        .order_by(SellerAssignment.id.desc())
    )
    if scope.tenant_id is not None:
        q = q.where(Raffle.tenant_id == scope.tenant_id)
    if raffle_id is not None:
        q = q.where(SellerAssignment.raffle_id == raffle_id)
    if seller_id is not None:
        q = q.where(SellerAssignment.seller_id == seller_id)
    elif actor.role == UserRole.SELLER:
        # un vendedor solo ve las suyas
        q = q.where(SellerAssignment.seller_id == actor.id)
    return (await db.execute(q)).scalars().all()


@router.post("", response_model=SellerAssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: SellerAssignmentCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == payload.raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)
    if not raffle.numbers_generated:
        raise HTTPException(status.HTTP_409_CONFLICT, "primero genera los números de la rifa")

    seller = (await db.execute(select(User).where(User.id == payload.seller_id, User.role == UserRole.SELLER))).scalar_one_or_none()
    if not seller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "vendedor no encontrado")
    # Seller debe pertenecer al mismo tenant de la rifa
    if seller.tenant_id != raffle.tenant_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "el vendedor no pertenece a la misma cuenta que la rifa.",
        )

    # Determinar el siguiente bloque libre: tomamos el mayor to_ticket asignado y arrancamos desde ahí + 1.
    max_assigned = (
        await db.execute(
            select(func.coalesce(func.max(SellerAssignment.to_ticket), 0)).where(
                SellerAssignment.raffle_id == raffle.id
            )
        )
    ).scalar_one()
    from_ticket = int(max_assigned) + 1
    to_ticket = from_ticket + payload.quantity - 1
    if to_ticket > raffle.total_tickets:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"sin boletas disponibles: solo quedan {raffle.total_tickets - max_assigned}",
        )

    assignment = SellerAssignment(
        raffle_id=raffle.id,
        seller_id=seller.id,
        from_ticket=from_ticket,
        to_ticket=to_ticket,
        status="active",
    )
    db.add(assignment)
    await db.flush()

    # Marcar boletas con seller_id
    labels = [str(i).zfill(3) for i in range(from_ticket, to_ticket + 1)]
    tickets = (
        await db.execute(
            select(Ticket).where(Ticket.raffle_id == raffle.id, Ticket.number_label.in_(labels))
        )
    ).scalars().all()
    for t in tickets:
        if t.seller_id is None:
            t.seller_id = seller.id

    await log_action(
        db, actor_id=actor.id, action="assignment.create",
        entity_type="assignment", entity_id=assignment.id, request=request,
        metadata={
            "seller_id": seller.id, "raffle_id": raffle.id,
            "from_ticket": from_ticket, "to_ticket": to_ticket,
        },
    )
    await db.commit()
    await db.refresh(assignment)
    return assignment
