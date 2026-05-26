from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus

router = APIRouter(prefix="/verify", tags=["public"])


@router.get("/{code}")
async def verify_public(code: str, db: Annotated[AsyncSession, Depends(get_db)]):
    """
    Endpoint público — devuelve sólo datos NO sensibles.
    Sin teléfono, sin nombre del cliente, sin información financiera.
    """
    res = await db.execute(
        select(Ticket).options(selectinload(Ticket.numbers)).where(Ticket.code == code)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == ticket.raffle_id)
        )
    ).scalar_one()

    return {
        "valid": True,
        "raffle": {
            "id": raffle.id,
            "name": raffle.name,
            "final_draw_date": raffle.final_draw_date.isoformat(),
            "lottery_name": raffle.lottery_name,
            "responsible_name": raffle.responsible_name,
            "responsible_phone": raffle.responsible_phone,
            "responsible_email": raffle.responsible_email,
            "terms": raffle.terms,
            "primary_color": raffle.primary_color,
        },
        "ticket": {
            "label": ticket.number_label,
            "code": ticket.code,
            "is_paid": ticket.status in (TicketStatus.PAID, TicketStatus.WINNING),
            "is_winner": ticket.status == TicketStatus.WINNING,
            # Orden por posición (NO por valor) para que la cancha 3-4-3
            # siempre pinte cada número en su lugar fijo.
            "numbers": [n.number for n in sorted(ticket.numbers, key=lambda x: x.position)],
        },
        "prizes": [
            {
                "name": p.name,
                "draw_date": p.draw_date.isoformat(),
                "winning_number": p.winning_number,
            }
            for p in raffle.prizes
        ],
    }
