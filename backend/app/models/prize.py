from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.raffle import Raffle


class Prize(Base, TimestampMixin):
    """Premio dentro de una rifa. Cada premio tiene su propia fecha de juego."""

    __tablename__ = "prizes"

    id: Mapped[int] = mapped_column(primary_key=True)
    raffle_id: Mapped[int] = mapped_column(ForeignKey("raffles.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)  # 1, 2, 3, 4...
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_value: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    draw_date: Mapped[date] = mapped_column(Date, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Resultado (se llena tras el sorteo)
    winning_number: Mapped[str | None] = mapped_column(String(10), nullable=True)
    winning_ticket_id: Mapped[int | None] = mapped_column(
        ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True
    )

    raffle: Mapped["Raffle"] = relationship(back_populates="prizes")
