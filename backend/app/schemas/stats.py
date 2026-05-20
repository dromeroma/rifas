from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.raffle import CommissionTier


class TicketStatusCount(BaseModel):
    status: str
    count: int


class NextDraw(BaseModel):
    prize_name: str
    draw_date: date
    days_remaining: int
    seconds_remaining: int


class SellerTierStatus(BaseModel):
    raffle_id: int
    seller_id: int
    paid_count: int
    current_tier: Optional[CommissionTier]
    next_tier: Optional[CommissionTier]
    tickets_to_next_tier: Optional[int]
    current_amount_per_ticket: Decimal
    earned_total: Decimal
    uses_tiers: bool


class RaffleStats(BaseModel):
    raffle_id: int
    total_tickets: int
    numbers_generated: bool
    by_status: List[TicketStatusCount]
    sold: int          # paid + winning
    reserved: int
    available: int
    revenue_collected: float
    revenue_potential: float
    can_run_draw: bool        # paid >= min_threshold
    min_threshold: int
    threshold_progress_pct: float
    next_draw: Optional[NextDraw]
    final_draw_date: date
    days_to_final_draw: int
