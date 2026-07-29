"""Modelos ORM del módulo notifications.

Dos tablas aditivas:

  notification_templates · plantillas por (tenant, key, channel).
                           Contenido con placeholders Mustache-like.
  notification_deliveries · una fila por intento de envío.
                            Guarda snapshot renderizado, status,
                            timestamps de sent/delivered/opened, y
                            cualquier metadata del provider.

Cero contacto con tablas existentes.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# ────────────────────────────────────────────────────────────────
# Enums
# ────────────────────────────────────────────────────────────────


class NotificationChannel(str, enum.Enum):
    """Canales soportados. Fase 1 activos: in_app, email, webhook.

    sms, whatsapp, push llegan cuando se contrata provider (BYO).
    """

    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    PUSH = "push"
    IN_APP = "in_app"
    WEBHOOK = "webhook"


class DeliveryStatus(str, enum.Enum):
    """Estados terminales y no-terminales de un envío."""

    QUEUED = "queued"          # creado, aún no enviado
    SENT = "sent"              # provider aceptó
    DELIVERED = "delivered"    # confirmación del destino (email opens, etc.)
    OPENED = "opened"          # tracking pixel / click
    CLICKED = "clicked"        # CTA usada
    FAILED = "failed"          # provider rechazó
    BLOCKED = "blocked"        # bloqueado por preference/consent


# ────────────────────────────────────────────────────────────────
# Template
# ────────────────────────────────────────────────────────────────


class NotificationTemplate(Base):
    """Plantilla parametrizable por (tenant, key, channel).

    `key` es un slug estable — las reglas y campañas la referencian
    por nombre (ej. "welcome_email", "purchase_thanks"). Al cambiar
    contenido no se rompen las referencias.
    """

    __tablename__ = "notification_templates"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    channel: Mapped[NotificationChannel] = mapped_column(
        SAEnum(
            NotificationChannel, name="notification_channel",
            native_enum=False, length=20,
        ),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Placeholders soportados: {{customer.full_name}}, {{data.amount}},
    # {{event.type}}, {{now.day_of_week}}. Ver renderer.render().
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Propósito de negocio: 'marketing', 'transactional', 'analytics',
    # 'personalization'. Se cruza con customer_consents antes de enviar
    # (los transaccionales usualmente no requieren opt-in explícito).
    purpose: Mapped[str] = mapped_column(
        String(40), nullable=False, default="transactional",
    )

    # Se puede desactivar sin borrar — útil para pausar envíos.
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True,
    )

    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "key", "channel",
            name="uq_notification_template_tenant_key_channel",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<NotificationTemplate {self.key!r}/{self.channel.value} "
            f"tenant={self.tenant_id}>"
        )


# ────────────────────────────────────────────────────────────────
# Delivery
# ────────────────────────────────────────────────────────────────


class NotificationDelivery(Base):
    """Un intento de envío. Append-only en la práctica — actualizamos
    solo `status`, timestamps y `error` de la fila creada.

    `idempotency_key` opcional para evitar duplicados; si viene, un
    (tenant_id, idempotency_key) segundo se ignora al insertar.
    """

    __tablename__ = "notification_deliveries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("notification_templates.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # Snapshot del template usado al momento del envío.
    template_key: Mapped[str] = mapped_column(String(80), nullable=False)
    channel: Mapped[NotificationChannel] = mapped_column(
        SAEnum(
            NotificationChannel, name="notification_channel",
            native_enum=False, length=20,
        ),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)

    # Destino resuelto (email address, phone E.164, webhook URL, etc.).
    destination: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Contenido renderizado — para audit + resend.
    rendered_subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    rendered_body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    rendered_html: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[DeliveryStatus] = mapped_column(
        SAEnum(
            DeliveryStatus, name="notification_delivery_status",
            native_enum=False, length=20,
        ),
        nullable=False,
        default=DeliveryStatus.QUEUED,
        index=True,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata devuelta por el provider (message_id, tracking_url).
    provider_meta: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict,
    )

    idempotency_key: Mapped[str | None] = mapped_column(
        String(120), nullable=True, index=True,
    )

    # Correlación con el evento que originó el envío.
    related_event_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True, index=True,
    )

    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    clicked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    __table_args__ = (
        # Idempotencia por tenant+key (si viene).
        UniqueConstraint(
            "tenant_id", "idempotency_key",
            name="uq_notification_delivery_tenant_idempo",
        ),
        # Consultas comunes: "últimas notifications de este customer".
        Index(
            "ix_notification_delivery_customer_created",
            "customer_id", "queued_at",
        ),
        # Cola por estado (para reintentos futuros).
        Index("ix_notification_delivery_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<NotificationDelivery #{self.id} {self.channel.value} "
            f"→ {self.destination!r} {self.status.value}>"
        )
