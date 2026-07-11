from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base_mixins import TimestampMixin


class Reservation(Base, TimestampMixin):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    release_reason: Mapped[str | None] = mapped_column(nullable=True)  # "expired" | "paid" | "cancelled"

    # ============ Pago diferido / programado ============
    # Fecha que el cliente eligió para pagar (opcional). Si viene con valor,
    # el sistema NO libera la boleta al vencer expires_at estándar (24h);
    # espera hasta scheduled_payment_date. Un cron manda recordatorio por
    # WhatsApp 1 día antes.
    scheduled_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # True cuando la venta se hizo desde el pool público general (sin
    # seller_slug). El ticket queda con seller_id = tenant.default_seller_id
    # para trazabilidad, pero NO genera comisión al aprobarse el pago.
    is_default_seller_sale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
