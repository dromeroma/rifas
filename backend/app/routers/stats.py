from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.prize import Prize
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User
from app.schemas.stats import NextDraw, RaffleStats, TicketStatusCount

# Umbral por defecto para "ya se puede correr el sorteo".
MIN_PAID_THRESHOLD = 200

router = APIRouter(tags=["stats"])


@router.get("/raffles/{raffle_id}/stats", response_model=RaffleStats)
async def raffle_stats(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
):
    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == raffle_id)
        )
    ).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")

    # Conteo por estado
    rows = (
        await db.execute(
            select(Ticket.status, func.count())
            .where(Ticket.raffle_id == raffle_id)
            .group_by(Ticket.status)
        )
    ).all()
    by_status_map = {s.value: c for s, c in rows}
    all_statuses = [s.value for s in TicketStatus]
    by_status = [
        TicketStatusCount(status=s, count=by_status_map.get(s, 0)) for s in all_statuses
    ]

    paid = by_status_map.get(TicketStatus.PAID.value, 0)
    winning = by_status_map.get(TicketStatus.WINNING.value, 0)
    reserved = by_status_map.get(TicketStatus.RESERVED.value, 0)
    pending = by_status_map.get(TicketStatus.PENDING_PAYMENT.value, 0)
    available = by_status_map.get(TicketStatus.AVAILABLE.value, 0)
    sold = paid + winning

    price = float(raffle.ticket_price or 0)
    revenue_collected = sold * price
    revenue_potential = raffle.total_tickets * price

    today = date.today()
    upcoming = [p for p in raffle.prizes if p.draw_date >= today]
    upcoming.sort(key=lambda p: p.draw_date)
    next_draw: NextDraw | None = None
    if upcoming:
        p = upcoming[0]
        days = (p.draw_date - today).days
        # segundos exactos al inicio del día del sorteo
        target = datetime.combine(p.draw_date, datetime.min.time(), tzinfo=timezone.utc)
        secs = int((target - datetime.now(timezone.utc)).total_seconds())
        next_draw = NextDraw(
            prize_name=p.name,
            draw_date=p.draw_date,
            days_remaining=max(days, 0),
            seconds_remaining=max(secs, 0),
        )

    threshold = MIN_PAID_THRESHOLD
    return RaffleStats(
        raffle_id=raffle.id,
        total_tickets=raffle.total_tickets,
        numbers_generated=raffle.numbers_generated,
        by_status=by_status,
        sold=sold,
        reserved=reserved + pending,
        available=available,
        revenue_collected=revenue_collected,
        revenue_potential=revenue_potential,
        can_run_draw=sold >= threshold,
        min_threshold=threshold,
        threshold_progress_pct=round(min(sold / threshold * 100, 100), 1) if threshold else 0,
        next_draw=next_draw,
        final_draw_date=raffle.final_draw_date,
        days_to_final_draw=max((raffle.final_draw_date - today).days, 0),
    )
