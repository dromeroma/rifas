from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


class TicketStatusCount(BaseModel):
    status: str
    count: int


class NextDraw(BaseModel):
    prize_name: str
    draw_date: date
    days_remaining: int
    seconds_remaining: int


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
