from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.payment import PaymentMethod, PaymentStatus


class PaymentCreate(BaseModel):
    ticket_id: int
    customer_id: int
    method: PaymentMethod
    amount: Decimal = Field(gt=0)
    reference: Optional[str] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    id: int
    ticket_id: int
    customer_id: int
    seller_id: Optional[int]
    method: PaymentMethod
    amount: Decimal
    reference: Optional[str]
    proof_url: Optional[str]
    notes: Optional[str]
    status: PaymentStatus
    confirmed_by: Optional[int]
    confirmed_at: Optional[datetime]
    rejection_reason: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentListItem(BaseModel):
    """Item enriquecido con datos del ticket, cliente y vendedor para la lista del admin."""
    id: int
    ticket_id: int
    ticket_label: str
    ticket_code: str
    ticket_status: str  # available | reserved | partially_paid | paid | etc.
    ticket_paid_amount: Decimal  # suma de pagos confirmados del ticket (incluye éste si es CONFIRMED)
    ticket_total_price: Decimal  # raffle.ticket_price
    raffle_name: str
    customer_id: int
    customer_name: str
    customer_phone: str
    seller_id: Optional[int]
    seller_name: Optional[str]
    method: PaymentMethod
    amount: Decimal
    reference: Optional[str]
    proof_url: Optional[str]
    notes: Optional[str]
    status: PaymentStatus
    rejection_reason: Optional[str]
    created_at: datetime
    confirmed_at: Optional[datetime]


class PaymentRejection(BaseModel):
    reason: str = Field(min_length=3, max_length=255)
