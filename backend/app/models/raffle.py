import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.prize import Prize
    from app.models.ticket import Ticket


class RaffleStatus(str, enum.Enum):
    DRAFT = "draft"               # creada, sin números generados
    ACTIVE = "active"             # números generados, en venta
    LOCKED = "locked"             # ventana de 7 días previos
    FINISHED = "finished"         # sorteo realizado
    CANCELLED = "cancelled"


class Raffle(Base, TimestampMixin):
    __tablename__ = "raffles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Parámetros matemáticos
    total_tickets: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    numbers_per_ticket: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    number_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    number_max: Mapped[int] = mapped_column(Integer, nullable=False, default=9999)
    number_digits: Mapped[int] = mapped_column(Integer, nullable=False, default=4)

    # Económico
    ticket_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    seller_commission: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # Sorteo
    final_draw_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Estado
    status: Mapped[RaffleStatus] = mapped_column(
        Enum(RaffleStatus), default=RaffleStatus.DRAFT, nullable=False
    )
    numbers_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    numbers_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    numbers_seed: Mapped[str | None] = mapped_column(String(128), nullable=True)  # hash de la mezcla, auditable

    # Branding
    logo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Información operativa visible al cliente (parametrizable por rifa)
    lottery_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    responsible_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    responsible_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    responsible_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)

    prizes: Mapped[list["Prize"]] = relationship(
        back_populates="raffle", cascade="all, delete-orphan", order_by="Prize.draw_date"
    )
    tickets: Mapped[list["Ticket"]] = relationship(
        back_populates="raffle", cascade="all, delete-orphan"
    )
