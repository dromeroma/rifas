"""Modelo ORM del módulo onboarding.

Tabla NUEVA `onboarding_step`. One row per (tenant, step_key).

Estados posibles:
  pending      — default al bootstrapping
  in_progress  — reservado; en Fase 1 se puede saltar directo a completed
  completed    — cumplido (auto vía bus o manual)
  skipped      — el owner decidió que no aplica

`completed_at`, `completed_by`, `trigger_event_id` dan trazabilidad:
quién/qué disparó la transición, útil para auditoría y debugging.
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
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OnboardingStepStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class OnboardingStep(Base):
    """Fila del checklist de un tenant para un step específico."""

    __tablename__ = "onboarding_steps"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Slug estable, referencia una entrada en steps.DEFAULT_STEPS.
    step_key: Mapped[str] = mapped_column(String(60), nullable=False)

    status: Mapped[OnboardingStepStatus] = mapped_column(
        SAEnum(
            OnboardingStepStatus, name="onboarding_step_status",
            native_enum=False, length=20,
        ),
        nullable=False,
        default=OnboardingStepStatus.PENDING,
        server_default=OnboardingStepStatus.PENDING.value,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    completed_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    trigger_event_id: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # Contexto opcional del step — snapshot de datos que justifican el
    # completed (ej: id del customer creado, id de la regla que disparó).
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
            "tenant_id", "step_key",
            name="uq_onboarding_step_tenant_key",
        ),
        Index(
            "ix_onboarding_step_tenant_status",
            "tenant_id", "status",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<OnboardingStep tenant={self.tenant_id} key={self.step_key!r} "
            f"status={self.status.value}>"
        )
