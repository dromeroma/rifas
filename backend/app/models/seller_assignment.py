from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class SellerAssignment(Base, TimestampMixin):
    """Bloque de boletas asignadas a un vendedor."""

    __tablename__ = "seller_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    raffle_id: Mapped[int] = mapped_column(ForeignKey("raffles.id", ondelete="CASCADE"), index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    from_ticket: Mapped[int] = mapped_column(Integer, nullable=False)  # ej: 1
    to_ticket: Mapped[int] = mapped_column(Integer, nullable=False)    # ej: 20
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    seller: Mapped["User"] = relationship(back_populates="assignments")
