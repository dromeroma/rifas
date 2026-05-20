from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.ticket import Ticket


class TicketNumber(Base):
    """
    Cada número individual de una boleta.
    Restricción crítica: UNIQUE(raffle_id, number) — un número nunca se repite en una rifa.
    """

    __tablename__ = "ticket_numbers"
    __table_args__ = (
        UniqueConstraint("raffle_id", "number", name="uq_raffle_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    raffle_id: Mapped[int] = mapped_column(
        ForeignKey("raffles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), index=True, nullable=False
    )
    number: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # "0421"
    position: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..20 — posición visual en la boleta

    ticket: Mapped["Ticket"] = relationship(back_populates="numbers")
