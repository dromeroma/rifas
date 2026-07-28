"""Modelos ORM del Rules Engine.

Tres tablas:

  rules            · una fila por regla lógica. Apunta a la
                     rule_version activa.
  rule_versions    · inmutable. Cada edición crea una versión nueva.
                     El DSL completo vive aquí como JSONB.
  rule_executions  · una fila por evaluación (evento × regla). Guarda
                     input, resultado (fired/skipped/errored), latencia,
                     y acciones aplicadas — telemetría + debug + dry-run
                     retrospectivo.

Multi-tenant: `tenant_id NOT NULL` en las tres.
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


class ExecutionStatus(str, enum.Enum):
    """Resultado de evaluar una regla contra un evento."""

    FIRED = "fired"        # condiciones OK + acciones ejecutadas
    SKIPPED = "skipped"    # condiciones NO cumplieron
    RATE_LIMITED = "rate_limited"  # tocó límite (per_customer / global)
    COOLED_DOWN = "cooled_down"    # dentro del cooldown
    ERRORED = "errored"    # falló una acción


class Rule(Base):
    """Regla lógica del tenant.

    Los datos DSL viven en RuleVersion. `Rule` sólo apunta a la versión
    activa + metadatos de gobernanza.
    """

    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Código legible que el admin usa como slug. Único por tenant.
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Categoría opcional para agrupar en la UI ("bienvenida",
    # "aniversario", "reactivación", "reglas de venta").
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # trigger_event_type se replica desde la versión activa a nivel
    # tabla para que la query "reglas que aplican a este evento" sea
    # un simple WHERE indexado — no JSON path.
    trigger_event_type: Mapped[str] = mapped_column(String(120), nullable=False)

    # Puntero a la versión activa. Null solo en draft inicial.
    active_version_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
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
        UniqueConstraint("tenant_id", "code", name="uq_rule_tenant_code"),
        # Query central del motor: "reglas activas del tenant para este type".
        Index(
            "ix_rule_tenant_trigger_enabled",
            "tenant_id", "trigger_event_type", "enabled",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Rule #{self.id} {self.code!r} tenant={self.tenant_id} "
            f"trigger={self.trigger_event_type!r} enabled={self.enabled}>"
        )


class RuleVersion(Base):
    """Versión inmutable del DSL de una regla.

    Cada edición del admin crea una fila nueva. La regla apunta a la
    versión activa. Rollback = cambiar active_version_id.
    """

    __tablename__ = "rule_versions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    # DSL completo tal como se aprobó — trigger, conditions, actions,
    # limits, cooldown_seconds. Ver docs/05-RULES_ENGINE.md.
    dsl: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Firma opcional del autor (member_id) + notas de la revisión.
    created_by_member_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
    )
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "rule_id", "version", name="uq_rule_version_rule_version",
        ),
    )

    def __repr__(self) -> str:
        return f"<RuleVersion rule={self.rule_id} v={self.version}>"


class RuleExecution(Base):
    """Telemetría por evaluación (rule × event).

    Se escribe siempre — incluso cuando la regla salta por condición
    o rate limit. Es la base para "ver últimas ejecuciones" en el
    panel del admin y el data pipeline futuro.
    """

    __tablename__ = "rule_executions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule_version_id: Mapped[int] = mapped_column(
        ForeignKey("rule_versions.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Correlación con el evento que disparó la evaluación.
    event_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)

    # Customer sobre el que la evaluación se ancló (extraído del event
    # o de su cadena de causalidad). Nulo si no aplica.
    customer_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True,
    )

    status: Mapped[ExecutionStatus] = mapped_column(
        SAEnum(
            ExecutionStatus, name="rule_execution_status",
            native_enum=False, length=20,
        ),
        nullable=False,
    )

    # Trazabilidad ligera de qué acciones se aplicaron o intentaron.
    actions_applied: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    dry_run: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        # "Últimas ejecuciones de esta regla" (admin panel).
        Index("ix_rule_execution_rule_id_created", "rule_id", "created_at"),
        # "¿Cuántas veces disparó esta regla para este customer hoy?".
        Index(
            "ix_rule_execution_rule_customer_status_created",
            "rule_id", "customer_id", "status", "created_at",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<RuleExecution rule={self.rule_id} event={self.event_id} "
            f"status={self.status.value}>"
        )
