"""Modelos ORM del módulo tenant.

Tabla NUEVA `tenant_profile` — one-to-one con `tenants` legacy.
Aditiva, no reemplaza. Contiene los datos que la Fase 1 necesita:

  - brand_name / brand_color_primary / brand_logo_url
  - vertical (ISP, restaurante, gym, retail, etc.) — llave para seeds
    de templates y sugerencias inteligentes
  - timezone / locale / currency — para render de notificaciones y
    cálculos de ventanas
  - status + activated_at — ciclo de vida
  - contact_email / contact_phone — datos operativos del owner
  - config JSONB — extensible sin migración

Enums viajan como VARCHAR (`native_enum=False`) para permitir agregar
valores sin ALTER TYPE (patrón usado en todo el modular monolith).
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TenantStatus(str, enum.Enum):
    """Ciclo de vida operativo del tenant en Perks."""

    DRAFT = "draft"          # provisionado, sin activar (default)
    ACTIVE = "active"        # activo — motor operando
    PAUSED = "paused"        # pausado por el owner (no procesa reglas)
    ARCHIVED = "archived"    # baja lógica


class TenantVertical(str, enum.Enum):
    """Vertical de negocio del tenant.

    Extensible. Se usa para:
      - Seleccionar seeds de templates de notificaciones.
      - Sugerir reglas comunes en el editor ("los gyms suelen dar 50 XP
        por asistencia").
      - Segmentar analytics agregado (post-Fase 1).
    """

    RETAIL = "retail"
    RESTAURANT = "restaurant"
    GYM = "gym"
    ISP = "isp"
    SAAS = "saas"
    SERVICE = "service"
    HOSPITALITY = "hospitality"
    EDUCATION = "education"
    HEALTHCARE = "healthcare"
    OTHER = "other"


class TenantProfile(Base):
    """Perfil extendido del tenant (one-to-one con `tenants`)."""

    __tablename__ = "tenant_profile"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # ── Branding ──────────────────────────────────────────────────
    brand_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    brand_color_primary: Mapped[str | None] = mapped_column(
        String(9), nullable=True,        # #rrggbb o #rrggbbaa
    )
    brand_color_secondary: Mapped[str | None] = mapped_column(
        String(9), nullable=True,
    )
    brand_logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Vertical ──────────────────────────────────────────────────
    vertical: Mapped[TenantVertical | None] = mapped_column(
        SAEnum(
            TenantVertical, name="tenant_vertical",
            native_enum=False, length=30,
        ),
        nullable=True,
    )

    # ── Localización ──────────────────────────────────────────────
    timezone: Mapped[str] = mapped_column(
        String(60), nullable=False, default="America/Bogota",
        server_default="America/Bogota",
    )
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, default="es-CO",
        server_default="es-CO",
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="COP",
        server_default="COP",
    )

    # ── Contacto ──────────────────────────────────────────────────
    contact_email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    support_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Ciclo de vida ─────────────────────────────────────────────
    status: Mapped[TenantStatus] = mapped_column(
        SAEnum(
            TenantStatus, name="tenant_status",
            native_enum=False, length=20,
        ),
        nullable=False,
        default=TenantStatus.DRAFT,
        server_default=TenantStatus.DRAFT.value,
    )
    activated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    activated_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Extensible ────────────────────────────────────────────────
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

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
        UniqueConstraint("tenant_id", name="uq_tenant_profile_tenant"),
    )

    def __repr__(self) -> str:
        return (
            f"<TenantProfile tenant={self.tenant_id} status={self.status.value} "
            f"brand={self.brand_name!r}>"
        )
