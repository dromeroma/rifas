from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_current_user, get_tenant_scope
from app.models.prize import Prize
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User, UserRole
from app.schemas.raffle import CommissionTier
from app.schemas.stats import NextDraw, RaffleStats, SellerTierStatus, TicketStatusCount
from app.services.commission_service import (
    count_paid_tickets_by_seller,
    resolve_commission_amount,
)

router = APIRouter(tags=["stats"])


@router.get("/raffles/{raffle_id}/stats", response_model=RaffleStats)
async def raffle_stats(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == raffle_id)
        )
    ).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

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

    threshold = raffle.min_paid_threshold or 0
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
        threshold_progress_pct=round(min(sold / threshold * 100, 100), 2) if threshold else 0,
        next_draw=next_draw,
        final_draw_date=raffle.final_draw_date,
        days_to_final_draw=max((raffle.final_draw_date - today).days, 0),
    )


@router.get("/raffles/{raffle_id}/seller-tier-status", response_model=SellerTierStatus)
async def seller_tier_status(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    seller_id: int | None = None,
):
    """Estado actual de comisión escalonada del vendedor en la rifa.
    - Si es vendedor, sólo puede consultar su propio estado.
    - Si es admin/super_admin, puede pasar ?seller_id=N para consultar a otro.
    """
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    target_seller_id: int
    if user.role == UserRole.SELLER:
        if seller_id is not None and seller_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "no autorizado")
        target_seller_id = user.id
    else:
        target_seller_id = seller_id if seller_id is not None else user.id

    paid_count = await count_paid_tickets_by_seller(
        db, seller_id=target_seller_id, raffle_id=raffle_id
    )
    amount_per_ticket = resolve_commission_amount(raffle, paid_count)
    earned_total = amount_per_ticket * paid_count

    tiers_raw = raffle.commission_tiers or []
    uses_tiers = bool(tiers_raw)
    current_tier: CommissionTier | None = None
    next_tier: CommissionTier | None = None
    tickets_to_next: int | None = None

    if uses_tiers:
        ordered = sorted(tiers_raw, key=lambda t: t["from_count"])
        for i, t in enumerate(ordered):
            to_c = t.get("to_count")
            in_range = paid_count >= t["from_count"] and (to_c is None or paid_count <= to_c)
            if in_range:
                current_tier = CommissionTier(**t)
                if i + 1 < len(ordered):
                    nxt = ordered[i + 1]
                    next_tier = CommissionTier(**nxt)
                    tickets_to_next = max(int(nxt["from_count"]) - paid_count, 0)
                break
        # Si no entró aún en ningún tramo (paid_count=0 con tramos empezando en 1, se cubre arriba),
        # marcamos el primer tramo como next_tier para guiar al vendedor.
        if current_tier is None and ordered:
            first = ordered[0]
            next_tier = CommissionTier(**first)
            tickets_to_next = max(int(first["from_count"]) - paid_count, 0)

    return SellerTierStatus(
        raffle_id=raffle.id,
        seller_id=target_seller_id,
        paid_count=paid_count,
        current_tier=current_tier,
        next_tier=next_tier,
        tickets_to_next_tier=tickets_to_next,
        current_amount_per_ticket=amount_per_ticket,
        earned_total=earned_total,
        uses_tiers=uses_tiers,
    )
