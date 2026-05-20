from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator

from app.models.raffle import RaffleStatus


# -------- Prize ----------

class PrizeBase(BaseModel):
    position: int = Field(ge=1)
    name: str = Field(min_length=2, max_length=200)
    description: Optional[str] = None
    estimated_value: Optional[Decimal] = None
    draw_date: date
    image_url: Optional[str] = None


class PrizeCreate(PrizeBase):
    pass


class PrizeOut(PrizeBase):
    id: int
    raffle_id: int
    winning_number: Optional[str] = None

    class Config:
        from_attributes = True


# -------- Raffle ----------

class RaffleCreate(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    description: Optional[str] = None
    total_tickets: int = Field(ge=1, default=500)
    numbers_per_ticket: int = Field(ge=1, default=20)
    number_min: int = Field(ge=0, default=0)
    number_max: int = Field(ge=1, default=9999)
    number_digits: int = Field(ge=1, le=10, default=4)
    ticket_price: Decimal = Field(gt=0)
    seller_commission: Decimal = Field(ge=0, default=0)
    final_draw_date: date
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    lottery_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None
    responsible_email: Optional[str] = None
    terms: Optional[str] = None
    prizes: List[PrizeCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_numbers(self):
        total_numbers = self.number_max - self.number_min + 1
        required = self.total_tickets * self.numbers_per_ticket
        if total_numbers != required:
            raise ValueError(
                f"el rango ({total_numbers}) no coincide con total_tickets*numbers_per_ticket ({required})"
            )
        return self


class RaffleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    final_draw_date: Optional[date] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    lottery_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None
    responsible_email: Optional[str] = None
    terms: Optional[str] = None


class RaffleOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    total_tickets: int
    numbers_per_ticket: int
    number_min: int
    number_max: int
    number_digits: int
    ticket_price: Decimal
    seller_commission: Decimal
    final_draw_date: date
    status: RaffleStatus
    numbers_generated: bool
    numbers_generated_at: Optional[datetime]
    logo_url: Optional[str]
    primary_color: Optional[str]
    lottery_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None
    responsible_email: Optional[str] = None
    terms: Optional[str] = None
    prizes: List[PrizeOut] = Field(default_factory=list)

    class Config:
        from_attributes = True
