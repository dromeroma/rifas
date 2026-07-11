"""
Tenant = "Cuenta" en la UI. Representa a un negocio que paga por usar
Boletera. Toda la información del negocio (usuarios, rifas, clientes,
pagos, comisiones) está aislada por tenant_id.

El super_admin de Boletera (deimerromeromadera@gmail.com) NO pertenece a
ningún tenant (tenant_id NULL) y puede ver todo.
"""

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.raffle import Raffle
    from app.models.user import User


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # URL-friendly. Ej: "rifas-don-pepe". Útil para subdominios futuros.
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)

    # Ventana de suscripción
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Cupo: máximo de rifas activas que puede crear este tenant.
    max_raffles: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Suspensión manual sin tocar fechas.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Contacto de cobranza / notas internas
    billing_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    billing_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Última notificación pre-vencimiento enviada (7, 3, 1 o None).
    # Usado para evitar duplicados: solo enviamos un threshold si es menor
    # que el último enviado.
    last_pre_expiry_notification_days: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
    )

    # ========== Configuración Wompi (venta pública online) ==========
    # Las llaves privadas están cifradas con Fernet (ver services/crypto_service).
    # Solo se descifran al momento de crear el checkout link.
    wompi_public_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wompi_private_key_enc: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    wompi_webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wompi_integrity_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 'sandbox' o 'production'. Determina la URL base del API de Wompi.
    wompi_env: Mapped[str] = mapped_column(String(20), default="sandbox", nullable=False)

    # Vendedor por defecto para ventas del pool público general (?v sin slug).
    # Los tickets quedan asignados a este vendedor visualmente para
    # trazabilidad, pero NO generan comisión (se marca la reservation
    # con is_default_seller_sale=True).
    default_seller_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    # ========== Branding del portal público ==========
    brand_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    brand_primary_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contact_whatsapp: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email_from: Mapped[str | None] = mapped_column(String(200), nullable=True)
    terms_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relaciones inversas (lazy="select" para no cargar a menos que se pida)
    users: Mapped[list["User"]] = relationship(back_populates="tenant", lazy="select")
    raffles: Mapped[list["Raffle"]] = relationship(back_populates="tenant", lazy="select")
    customers: Mapped[list["Customer"]] = relationship(back_populates="tenant", lazy="select")
