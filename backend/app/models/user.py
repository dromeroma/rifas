import enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.commission import Commission
    from app.models.seller_assignment import SellerAssignment


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    SELLER = "seller"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Para vendedores: comisión por defecto por boleta vendida (COP).
    default_commission: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    assignments: Mapped[list["SellerAssignment"]] = relationship(
        back_populates="seller", cascade="all, delete-orphan"
    )
    commissions: Mapped[list["Commission"]] = relationship(back_populates="seller")
