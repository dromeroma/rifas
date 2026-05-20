from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Commission(Base, TimestampMixin):
    __tablename__ = "commissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    raffle_id: Mapped[int] = mapped_column(ForeignKey("raffles.id", ondelete="CASCADE"), index=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="RESTRICT"))
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"))

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending|paid|cancelled
    paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    seller: Mapped["User"] = relationship(back_populates="commissions")
