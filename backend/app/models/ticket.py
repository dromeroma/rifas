import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.raffle import Raffle
    from app.models.ticket_number import TicketNumber
    from app.models.user import User


class TicketStatus(str, enum.Enum):
    AVAILABLE = "available"
    RESERVED = "reserved"
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    EXPIRED = "expired"
    WINNING = "winning"


class Ticket(Base, TimestampMixin):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("raffle_id", "code", name="uq_raffle_ticket_code"),
        UniqueConstraint("raffle_id", "number_label", name="uq_raffle_ticket_number_label"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    raffle_id: Mapped[int] = mapped_column(ForeignKey("raffles.id", ondelete="CASCADE"), index=True)

    # Identificadores
    number_label: Mapped[str] = mapped_column(String(10), nullable=False)  # "001", "002"...
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # ej: 7Z3-4K9-PLM (único en la rifa)
    qr_payload: Mapped[str] = mapped_column(String(255), nullable=False)  # token firmado para QR

    # Estado
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus), default=TicketStatus.AVAILABLE, nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # bloqueo optimista

    # Relaciones
    seller_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)

    raffle: Mapped["Raffle"] = relationship(back_populates="tickets")
    numbers: Mapped[list["TicketNumber"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="TicketNumber.position"
    )
    seller: Mapped["User | None"] = relationship(foreign_keys=[seller_id])
    customer: Mapped["Customer | None"] = relationship(back_populates="tickets")
