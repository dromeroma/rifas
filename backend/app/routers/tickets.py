from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.raffle import Raffle
from app.models.reservation import Reservation
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User, UserRole
from app.schemas.ticket import ReserveRequest, TicketOut, TicketSummary
from app.services.audit_service import log_action
from app.services.image_service import build_ticket_image
from app.services.pdf_service import build_ticket_pdf
from app.services.qr_service import build_verify_url, generate_qr_png
from app.services.reservation_service import (
    mark_ticket_paid,
    release_by_ticket,
    reserve_ticket,
)

router = APIRouter(tags=["tickets"])


async def _load_ticket_out(db: AsyncSession, ticket_id: int) -> TicketOut | None:
    """Carga el ticket completo y devuelve el DTO con customer, seller y expira."""
    res = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.numbers),
            selectinload(Ticket.customer),
            selectinload(Ticket.seller),
        )
        .where(Ticket.id == ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        return None

    dto = TicketOut.model_validate(ticket)

    if ticket.status in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT):
        exp = await db.execute(
            select(Reservation.expires_at)
            .where(
                Reservation.ticket_id == ticket.id,
                Reservation.is_active.is_(True),
            )
            .order_by(Reservation.id.desc())
            .limit(1)
        )
        expires_at = exp.scalar_one_or_none()
        if expires_at:
            dto.reservation_expires_at = expires_at
    return dto


@router.get("/raffles/{raffle_id}/tickets", response_model=List[TicketSummary])
async def list_tickets(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
):
    res = await db.execute(
        select(Ticket).where(Ticket.raffle_id == raffle_id).order_by(Ticket.number_label)
    )
    return res.scalars().all()


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
):
    dto = await _load_ticket_out(db, ticket_id)
    if not dto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")
    return dto


@router.post("/tickets/{ticket_id}/reserve", response_model=TicketOut)
async def reserve(
    ticket_id: int,
    payload: ReserveRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
    reservation = await reserve_ticket(
        db, ticket_id=ticket_id, seller_id=actor.id, customer_id=payload.customer_id
    )
    await log_action(
        db, actor_id=actor.id, action="ticket.reserve",
        entity_type="ticket", entity_id=ticket_id, request=request,
        metadata={"customer_id": payload.customer_id, "expires_at": reservation.expires_at.isoformat()},
    )
    await db.commit()
    return await _load_ticket_out(db, ticket_id)


@router.post("/tickets/{ticket_id}/release", response_model=TicketOut)
async def release_ticket(
    ticket_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
    """Libera una reserva. El vendedor solo puede liberar las suyas; admin puede liberar cualquiera."""
    ticket = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    if ticket.status not in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"la boleta no está reservada (estado actual: {ticket.status.value})",
        )

    # Permisos: vendedor solo libera las propias
    if actor.role == UserRole.SELLER and ticket.seller_id != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no puedes liberar una boleta que no es tuya")

    released = await release_by_ticket(db, ticket_id=ticket_id, reason="cancelled_by_user")
    if not released:
        raise HTTPException(status.HTTP_409_CONFLICT, "no hay reserva activa para liberar")

    await log_action(
        db, actor_id=actor.id, action="ticket.release",
        entity_type="ticket", entity_id=ticket_id, request=request,
    )
    await db.commit()
    return await _load_ticket_out(db, ticket_id)


@router.post("/tickets/{ticket_id}/mark-paid", response_model=TicketOut)
async def mark_paid(
    ticket_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
    """Marca la boleta como pagada. El vendedor solo puede marcar las suyas."""
    ticket = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    if actor.role == UserRole.SELLER and ticket.seller_id != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no puedes marcar pagada una boleta que no es tuya")

    await mark_ticket_paid(db, ticket_id=ticket_id)
    await log_action(
        db, actor_id=actor.id, action="ticket.mark_paid",
        entity_type="ticket", entity_id=ticket_id, request=request,
    )
    await db.commit()
    return await _load_ticket_out(db, ticket_id)


@router.get("/tickets/{ticket_id}/qr")
async def get_qr(ticket_id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    ticket = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")
    png = generate_qr_png(build_verify_url(ticket.code))
    return Response(content=png, media_type="image/png")


@router.get("/tickets/{ticket_id}/pdf")
async def get_pdf(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
):
    res = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.numbers))
        .where(Ticket.id == ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == ticket.raffle_id)
        )
    ).scalar_one()

    numbers_ordered = [n.number for n in sorted(ticket.numbers, key=lambda x: x.position)]
    prizes = [{"name": p.name, "draw_date": p.draw_date.isoformat()} for p in raffle.prizes]
    pdf = build_ticket_pdf(
        raffle_name=raffle.name,
        ticket_label=ticket.number_label,
        ticket_code=ticket.code,
        qr_payload=ticket.qr_payload,
        numbers=numbers_ordered,
        prizes=prizes,
        primary_color=raffle.primary_color,
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="boleta-{ticket.code}.pdf"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.get("/tickets/{ticket_id}/image")
async def get_image(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
):
    """Genera un PNG de la boleta — ideal para compartir por WhatsApp."""
    res = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.numbers), selectinload(Ticket.customer))
        .where(Ticket.id == ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == ticket.raffle_id)
        )
    ).scalar_one()

    numbers_ordered = [n.number for n in sorted(ticket.numbers, key=lambda x: x.position)]
    prizes = [{"name": p.name, "draw_date": p.draw_date.isoformat()} for p in raffle.prizes]
    png = build_ticket_image(
        raffle_name=raffle.name,
        ticket_label=ticket.number_label,
        ticket_code=ticket.code,
        numbers=numbers_ordered,
        prizes=prizes,
        customer_name=ticket.customer.full_name if ticket.customer else None,
        is_paid=ticket.status in (TicketStatus.PAID, TicketStatus.WINNING),
        primary_color=raffle.primary_color,
        lottery_name=raffle.lottery_name,
        responsible_name=raffle.responsible_name,
        responsible_phone=raffle.responsible_phone,
        final_draw_date=raffle.final_draw_date.isoformat(),
    )
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="boleta-{ticket.code}.png"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )
