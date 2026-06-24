import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.prize import Prize
    from app.models.tenant import Tenant
    from app.models.ticket import Ticket


class RaffleStatus(str, enum.Enum):
    DRAFT = "draft"               # creada, sin números generados
    ACTIVE = "active"             # números generados, en venta
    LOCKED = "locked"             # ventana de 7 días previos
    FINISHED = "finished"         # sorteo realizado
    CANCELLED = "cancelled"


class RaffleMode(str, enum.Enum):
    """Modalidad de venta de la rifa. Inmutable después de crear."""
    CLASSIC = "classic"   # 500 boletas × 20 números, venta unitaria de boleta
    PACKAGE = "package"   # N números individuales, venta en paquetes (estilo moto)
    EXPRESS = "express"   # 100 números, sorteo en 24-72h, 1 número por ticket


class Raffle(Base, TimestampMixin):
    __tablename__ = "raffles"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Tenant al que pertenece esta rifa. NOT NULL después del backfill.
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    tenant: Mapped["Tenant"] = relationship(back_populates="raffles")

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Modalidad de venta. Inmutable después de crear.
    mode: Mapped[RaffleMode] = mapped_column(
        String(20), nullable=False, default=RaffleMode.CLASSIC,
    )

    # Parámetros matemáticos
    total_tickets: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    numbers_per_ticket: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    number_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    number_max: Mapped[int] = mapped_column(Integer, nullable=False, default=9999)
    number_digits: Mapped[int] = mapped_column(Integer, nullable=False, default=4)

    # Solo para mode='package': configuración de paquetes.
    # Formato JSONB: [{"size": 30, "price": 12000}, {"size": 50, "price": 20000}]
    package_options: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Tamaño mínimo del paquete que el cliente puede comprar.
    min_package_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Económico
    ticket_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    seller_commission: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # Umbral de boletas pagadas para poder lanzar el sorteo (editable).
    min_paid_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=200)

    # Comisión escalonada por tramos. Inmutable después de crear la rifa.
    # Estructura: [{"from_count": 1, "to_count": 30, "amount_per_ticket": 3000}, ...]
    # to_count=null en el último tramo indica "sin límite superior".
    # Modelo de "tier calificador": el tramo alcanzado aplica a TODAS las boletas vendidas.
    commission_tiers: Mapped[list | None] = mapped_column(JSONB, nullable=True)

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

    # Diseño visual de la boleta. Soportados: 'soccer' (cancha de fútbol con
    # chips ovalados — default), 'romantic' (corazones + silueta de pareja
    # para rifas de amor y amistad). Editable mientras la rifa esté DRAFT.
    ticket_theme: Mapped[str] = mapped_column(String(20), nullable=False, default="soccer")

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
