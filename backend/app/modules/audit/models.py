"""Modelo ORM del módulo audit — tabla `audit_logs`.

Append-only. La unicidad `(source_event_id, tenant_id)` garantiza
que retries del dispatcher no dupliquen — el handler usa
ON CONFLICT DO NOTHING.

Los campos denormalizados (actor_kind, actor_id, resource_kind,
resource_id) permiten filtrar por índice sin JSONB scans.
`changes` guarda el snapshot minificado — nunca payloads gigantes.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
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


class AuditSeverity(str, enum.Enum):
    """Clasificación operativa del evento auditado."""

    INFO = "info"           # cambio normal (update perfil, editar regla)
    NOTICE = "notice"       # transición relevante (activate, publish rule)
    WARN = "warn"           # regresión o error operativo
    CRITICAL = "critical"   # incidente que requiere revisión inmediata


class AuditLog(Base):
    """Bitácora inmutable de acciones administrativas."""

    __tablename__ = "perks_audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,          # eventos platform.* pueden no tener tenant
        index=True,
    )

    # ── Actor (quién) ─────────────────────────────────────────
    actor_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Label denormalizado para display sin joins (ej: "member:42").
    actor_label: Mapped[str] = mapped_column(String(120), nullable=False)

    # ── Acción (qué) ──────────────────────────────────────────
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[AuditSeverity] = mapped_column(
        SAEnum(
            AuditSeverity, name="audit_severity",
            native_enum=False, length=20,
        ),
        nullable=False,
        default=AuditSeverity.INFO,
        server_default=AuditSeverity.INFO.value,
    )

    # ── Recurso afectado ──────────────────────────────────────
    resource_kind: Mapped[str | None] = mapped_column(String(60), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # ── Diff / contexto ──────────────────────────────────────
    changes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Correlación con el bus ───────────────────────────────
    source_event_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True,
    )
    trigger_event_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True,
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        # Unicidad de idempotencia — el mismo evento del bus solo
        # se persiste una vez por tenant, incluso con retries.
        UniqueConstraint(
            "tenant_id", "source_event_id",
            name="uq_perks_audit_tenant_source_event",
        ),
        Index("ix_perks_audit_tenant_action", "tenant_id", "action"),
        Index("ix_perks_audit_tenant_actor", "tenant_id", "actor_kind", "actor_id"),
        Index(
            "ix_perks_audit_tenant_resource",
            "tenant_id", "resource_kind", "resource_id",
        ),
        Index("ix_perks_audit_tenant_occurred", "tenant_id", "occurred_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog #{self.id} tenant={self.tenant_id} "
            f"action={self.action!r} actor={self.actor_label!r} "
            f"resource={self.resource_kind}:{self.resource_id}>"
        )
