"""Operaciones administrativas: housekeeping, sorteo, búsquedas."""

from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_tenant_scope, require_roles
from app.models.customer import Customer
from app.models.prize import Prize
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_number import TicketNumber
from app.models.user import User, UserRole
from app.schemas.ticket import TicketSummary
from app.services.audit_service import log_action
from app.services.reservation_service import expire_overdue

router = APIRouter(prefix="/admin", tags=["admin"])


# ============ Liberar reservas vencidas ============

class ExpireResult(BaseModel):
    released: int


@router.post("/expire-reservations", response_model=ExpireResult)
async def expire_reservations(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN))],
):
    """Libera todas las reservas cuyo expires_at ya pasó. Llamada manual; el worker hace lo mismo automático."""
    released = await expire_overdue(db)
    await log_action(
        db, actor_id=actor.id, action="reservations.expire_bulk",
        description=f"liberación masiva de {released} reservas vencidas",
        request=request, metadata={"released": released},
    )
    await db.commit()
    return ExpireResult(released=released)


# ============ Registrar ganador del sorteo ============

class DrawWinnerRequest(BaseModel):
    prize_id: int
    winning_number: str = Field(min_length=1, max_length=10)


class DrawWinnerResult(BaseModel):
    prize_id: int
    prize_name: str
    winning_number: str
    ticket_id: int | None
    ticket_label: str | None
    customer_name: str | None
    customer_phone: str | None
    is_paid: bool


@router.post("/raffles/{raffle_id}/draw", response_model=DrawWinnerResult)
async def draw_winner(
    raffle_id: int,
    payload: DrawWinnerRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """
    Registra el número ganador de un premio.
    Busca qué boleta de la rifa contiene ese número y la marca como WINNING.
    """
    # Pad con ceros según el formato de la rifa
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    winning = payload.winning_number.zfill(raffle.number_digits)

    prize = (
        await db.execute(
            select(Prize).where(Prize.id == payload.prize_id, Prize.raffle_id == raffle_id)
        )
    ).scalar_one_or_none()
    if not prize:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "premio no encontrado para esta rifa")

    if prize.winning_number:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"el premio ya tiene ganador registrado ({prize.winning_number}). Solo se puede registrar una vez.",
        )

    # Buscar la boleta que contiene ese número
    tn = (
        await db.execute(
            select(TicketNumber).where(
                TicketNumber.raffle_id == raffle_id,
                TicketNumber.number == winning,
            )
        )
    ).scalar_one_or_none()
    if not tn:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"el número {winning} no existe en esta rifa (rango {raffle.number_min}-{raffle.number_max})",
        )

    ticket = (
        await db.execute(
            select(Ticket)
            .options(selectinload(Ticket.customer))
            .where(Ticket.id == tn.ticket_id)
        )
    ).scalar_one()

    # Guardar ganador en el premio + marcar boleta como WINNING (si está pagada)
    prize.winning_number = winning
    prize.winning_ticket_id = ticket.id

    if ticket.status == TicketStatus.PAID:
        ticket.status = TicketStatus.WINNING
        ticket.version += 1

    await log_action(
        db, actor_id=actor.id, action="raffle.draw_winner",
        entity_type="prize", entity_id=prize.id, request=request,
        metadata={
            "raffle_id": raffle_id,
            "prize_name": prize.name,
            "winning_number": winning,
            "ticket_id": ticket.id,
            "ticket_label": ticket.number_label,
            "ticket_was_paid": ticket.status in (TicketStatus.PAID, TicketStatus.WINNING),
        },
    )
    await db.commit()

    return DrawWinnerResult(
        prize_id=prize.id,
        prize_name=prize.name,
        winning_number=winning,
        ticket_id=ticket.id,
        ticket_label=ticket.number_label,
        customer_name=ticket.customer.full_name if ticket.customer else None,
        customer_phone=ticket.customer.phone if ticket.customer else None,
        is_paid=ticket.status in (TicketStatus.PAID, TicketStatus.WINNING),
    )


# ============ Boletas por cliente (búsqueda) ============

class CustomerTicketsResult(BaseModel):
    customer_id: int
    customer_name: str
    customer_phone: str
    tickets: List[TicketSummary]


@router.get("/customers/{customer_id}/tickets", response_model=CustomerTicketsResult)
async def customer_tickets(
    customer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    customer = (await db.execute(select(Customer).where(Customer.id == customer_id))).scalar_one_or_none()
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cliente no encontrado")
    assert_tenant_owns(scope, customer.tenant_id)

    tickets = (
        await db.execute(
            select(Ticket).where(Ticket.customer_id == customer_id).order_by(Ticket.id.desc())
        )
    ).scalars().all()

    return CustomerTicketsResult(
        customer_id=customer.id,
        customer_name=customer.full_name,
        customer_phone=customer.phone,
        tickets=list(tickets),  # se serializa con TicketSummary
    )
