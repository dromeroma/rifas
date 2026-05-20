from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.ticket import Ticket


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    document: Mapped[str | None] = mapped_column(String(30), index=True, nullable=True)
    phone: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Quién creó al cliente (admin o vendedor). Permite que el vendedor vea en
    # "Mis clientes" tanto los clientes a los que les ha vendido como los que
    # él mismo registró.
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    tickets: Mapped[list["Ticket"]] = relationship(back_populates="customer")
