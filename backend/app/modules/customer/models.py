"""Modelos ORM del módulo customer.

Tablas NUEVAS (aditivas, cero contacto con `customers` legacy):
  - customer_identities  · N identities por customer (email, phone, doc, external_id).
  - customer_preferences · consentimientos por canal (email/sms/whatsapp/push).
  - customer_consents    · consents versionados con timestamp para
                            Habeas Data / GDPR.

Todas las tablas llevan `tenant_id` obligatorio (multi-tenant, ADR-003).

Deuda técnica documentada:
  Durante la Fase 1 el customer_id FK apunta a la tabla `customers`
  legacy (creada por el módulo raffles actual). Post-cutover, cuando
  `raffles` sea solo un módulo, el customer nuevo será fuente de
  verdad. Este archivo NO importa el modelo legacy — trata a la tabla
  `customers` como una tabla compartida y sólo referencia su `id`.
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
# Identities
# ────────────────────────────────────────────────────────────────


class IdentityKind(str, enum.Enum):
    """Tipos de identidad soportados para reconocer a un Customer.

    Extensible: agregar un nuevo valor NO requiere migración porque los
    enums viajan como VARCHAR (native_enum=False).
    """

    EMAIL = "email"
    PHONE = "phone"          # normalizado a E.164
    DOCUMENT = "document"    # cédula / ID nacional
    EXTERNAL = "external"    # id opaco del sistema del tenant (POS, CRM)


class CustomerIdentity(Base):
    """Una forma de reconocer a un Customer.

    Unicidad global por (tenant_id, kind, value_normalized). El
    `value_normalized` se calcula en el service (lowercase para email,
    E.164 para phone, sin espacios/guiones para document) para evitar
    duplicados por variaciones tipográficas.
    """

    __tablename__ = "customer_identities"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    kind: Mapped[IdentityKind] = mapped_column(
        SAEnum(
            IdentityKind, name="customer_identity_kind",
            native_enum=False, length=20,
        ),
        nullable=False,
    )
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    # Copia normalizada usada para búsquedas y unicidad — nunca mostrada.
    value_normalized: Mapped[str] = mapped_column(String(200), nullable=False)

    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    verification_source: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
    )   # ej. "otp_email", "otp_sms", "admin_manual"

    # Origen del descubrimiento — trazabilidad de cómo llegó al sistema.
    source: Mapped[str | None] = mapped_column(String(60), nullable=True)
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
        # Sin duplicados de la misma identity por tenant.
        UniqueConstraint(
            "tenant_id", "kind", "value_normalized",
            name="uq_customer_identity_tenant_kind_value",
        ),
        # Query típica: "traeme identities de este customer".
        Index("ix_customer_identity_customer_kind", "customer_id", "kind"),
    )

    def __repr__(self) -> str:
        return (
            f"<CustomerIdentity id={self.id} tenant={self.tenant_id} "
            f"customer={self.customer_id} {self.kind.value}={self.value!r}>"
        )


# ────────────────────────────────────────────────────────────────
# Preferences
# ────────────────────────────────────────────────────────────────


class NotificationChannel(str, enum.Enum):
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    PUSH = "push"


class CustomerPreference(Base):
    """Opt-in por canal.

    Registro estable — una fila por (customer, channel). Cambio de
    valor sobrescribe. Para historial usar `customer_consents` que sí
    es append-only.
    """

    __tablename__ = "customer_preferences"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        SAEnum(
            NotificationChannel, name="notification_channel",
            native_enum=False, length=20,
        ),
        nullable=False,
    )
    allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Contexto opcional: horario permitido, idioma preferido, tags.
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

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
            "tenant_id", "customer_id", "channel",
            name="uq_customer_preference_channel",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<CustomerPreference customer={self.customer_id} "
            f"channel={self.channel.value} allowed={self.allowed}>"
        )


# ────────────────────────────────────────────────────────────────
# Consents (Habeas Data / GDPR)
# ────────────────────────────────────────────────────────────────


class ConsentAction(str, enum.Enum):
    GRANTED = "granted"
    REVOKED = "revoked"


class CustomerConsent(Base):
    """Historia inmutable de consents.

    Append-only — cada cambio (grant / revoke) genera una fila nueva.
    Se usa para responder auditorías de Habeas Data (Ley 1581 Colombia)
    y GDPR: "muéstrame cuándo autorizó y cuándo revocó".
    """

    __tablename__ = "customer_consents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    purpose: Mapped[str] = mapped_column(String(80), nullable=False)
    # Ejemplos de purpose: 'marketing', 'transactional', 'analytics',
    # 'personalization', 'third_party_share'. Free-form pero estable
    # por tenant (documentar en su README).

    action: Mapped[ConsentAction] = mapped_column(
        SAEnum(
            ConsentAction, name="consent_action",
            native_enum=False, length=20,
        ),
        nullable=False,
    )

    # Evidencia: canal, IP, user_agent, versión del texto legal.
    source: Mapped[str] = mapped_column(String(60), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Versión del texto legal aceptado en este evento (para audit trail).
    policy_version: Mapped[str | None] = mapped_column(String(40), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        # Query típica: "consent actual de este customer para este purpose".
        Index(
            "ix_customer_consent_customer_purpose",
            "customer_id", "purpose", "granted_at",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<CustomerConsent customer={self.customer_id} "
            f"purpose={self.purpose!r} action={self.action.value} "
            f"at={self.granted_at.isoformat()}>"
        )
