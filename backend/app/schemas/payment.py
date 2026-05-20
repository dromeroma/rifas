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
    status: PaymentStatus
    confirmed_by: Optional[int]
    confirmed_at: Optional[datetime]
    rejection_reason: Optional[str]

    class Config:
        from_attributes = True


class PaymentRejection(BaseModel):
    reason: str = Field(min_length=3, max_length=255)
