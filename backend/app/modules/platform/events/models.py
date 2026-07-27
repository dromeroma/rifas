"""Modelos ORM del event bus.

Dos tablas core:

  event_outbox    — cada evento publicado por un módulo. El dispatcher
                    lo consume y despacha a los handlers registrados.
  event_handled   — resultado por (event_id, handler_id). Garantiza
                    idempotencia: un handler jamás procesa el mismo
                    evento dos veces con éxito.

Ambas son aditivas, no tocan tablas existentes de la app legacy.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OutboxStatus(str, enum.Enum):
    """Estado de un evento en el outbox."""

    PENDING = "pending"
    DISPATCHED = "dispatched"
    FAILED = "failed"


class HandledStatus(str, enum.Enum):
    """Resultado de un handler específico sobre un evento."""

    SUCCESS = "success"
    FAILED = "failed"
    DEAD = "dead"


class EventOutbox(Base):
    """Cola durable de eventos por procesar.

    Se escribe en la misma transacción del cambio de estado que motiva
    el evento (patrón outbox). El dispatcher consume asincrónicamente.
    """

    __tablename__ = "event_outbox"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    event_id: Mapped[str] = mapped_column(
        String(40), nullable=False, unique=True, index=True,
    )
    type: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # tenant_id es nullable a propósito: eventos de plataforma
    # (`platform.tenant.created`, etc.) no pertenecen a un tenant.
    tenant_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True,
    )

    actor: Mapped[dict] = mapped_column(JSONB, nullable=False)
    subject: Mapped[dict] = mapped_column(JSONB, nullable=False)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    idempotency_key: Mapped[str | None] = mapped_column(
        String(120), nullable=True, index=True,
    )

    status: Mapped[OutboxStatus] = mapped_column(
        SAEnum(OutboxStatus, name="outbox_status", native_enum=False, length=20),
        nullable=False,
        default=OutboxStatus.PENDING,
        index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    dispatched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        # Índice compuesto para el patrón típico del dispatcher:
        # "traeme los pendientes ordenados por id".
        Index(
            "ix_event_outbox_status_id",
            "status",
            "id",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<EventOutbox id={self.id} type={self.type!r} "
            f"status={self.status.value} event_id={self.event_id!r}>"
        )


class EventHandled(Base):
    """Trazabilidad por (event, handler) — clave para idempotencia.

    PK compuesta impide procesar dos veces el mismo evento con el
    mismo handler. Un `INSERT ... ON CONFLICT DO NOTHING` en el
    dispatcher garantiza el "exactly-once por handler".
    """

    __tablename__ = "event_handled"

    event_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    handler_id: Mapped[str] = mapped_column(String(200), primary_key=True)

    status: Mapped[HandledStatus] = mapped_column(
        SAEnum(HandledStatus, name="handled_status", native_enum=False, length=20),
        nullable=False,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    handled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        # Consulta común: "reintentar los que fallaron y no están dead".
        Index("ix_event_handled_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<EventHandled event_id={self.event_id!r} "
            f"handler={self.handler_id!r} status={self.status.value}>"
        )
