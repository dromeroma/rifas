from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.ticket import Ticket


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Tenant al que pertenece este cliente. NOT NULL después del backfill.
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    tenant: Mapped["Tenant"] = relationship(back_populates="customers")

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

    # ========== Portal público del cliente ==========
    # Marca true cuando el cliente valida su email con un magic link enviado
    # a su bandeja. Requerido para el portal /mi-cuenta.
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Código único para invitar amigos. Se genera al primer login exitoso.
    referral_code: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)
    # Cliente que refirió a éste (si vino por link de referido).
    referred_by_customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True,
    )

    tickets: Mapped[list["Ticket"]] = relationship(back_populates="customer")
