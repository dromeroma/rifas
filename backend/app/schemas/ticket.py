from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel

from app.models.ticket import TicketStatus


class TicketNumberOut(BaseModel):
    number: str
    position: int

    class Config:
        from_attributes = True


class TicketCustomer(BaseModel):
    id: int
    full_name: str
    phone: str
    document: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None

    class Config:
        from_attributes = True


class TicketSeller(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str] = None

    class Config:
        from_attributes = True


class TicketOut(BaseModel):
    id: int
    raffle_id: int
    number_label: str
    code: str
    status: TicketStatus
    seller_id: Optional[int]
    customer_id: Optional[int]
    numbers: List[TicketNumberOut]
    customer: Optional[TicketCustomer] = None
    seller: Optional[TicketSeller] = None
    reservation_expires_at: Optional[datetime] = None
    # Suma de pagos CONFIRMED. Si paid_amount < raffle.ticket_price el ticket
    # vive en RESERVED / PENDING_PAYMENT / PARTIALLY_PAID. Cuando se completa
    # el total → PAID y se genera comisión.
    paid_amount: Decimal = Decimal(0)

    class Config:
        from_attributes = True


class ExtendReservationRequest(BaseModel):
    hours: int = 24


class TicketSummary(BaseModel):
    id: int
    raffle_id: int
    number_label: str
    code: str
    status: TicketStatus
    seller_id: Optional[int] = None
    customer_id: Optional[int] = None

    class Config:
        from_attributes = True


class ReserveRequest(BaseModel):
    customer_id: Optional[int] = None


class ReservePackageRequest(BaseModel):
    raffle_id: int
    package_size: int
    customer_id: int


class ReservePackageResult(BaseModel):
    reserved: int
    raffle_id: int
    customer_id: int
    ticket_ids: list[int]
    labels: list[str]
    numbers: list[str]
