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


# ---------- Impresión física de boletas ----------

class PrintTicketItem(BaseModel):
    """Una boleta a imprimir en hoja física. El admin imprime un PDF de hoja
    carta con 4 boletas por página y se las entrega al vendedor."""
    ticket_id: int
    number_label: str            # "001", "005"
    code: str                    # 7Z3-4K9-PLM (único global)
    short_code: str              # 4 chars derivados de `code` para escribir a mano
    numbers: list[str]
    printed_at: Optional[datetime] = None


class PrintDataResponse(BaseModel):
    raffle_id: int
    raffle_name: str
    final_draw_date: str
    primary_color: Optional[str] = None
    logo_url: Optional[str] = None
    lottery_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None
    seller_id: int
    seller_name: str
    seller_phone: Optional[str] = None
    prizes: list[dict]
    tickets: list[PrintTicketItem]


class MarkPrintedRequest(BaseModel):
    ticket_ids: list[int]
