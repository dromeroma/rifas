"""Event envelope — estructura canónica de todo evento del bus.

Todos los eventos que viajan por el bus interno tienen este shape.
Ver docs/04-EVENTS.md para el diseño completo.

Reglas del envelope:
  - Inmutable una vez construido (Pydantic frozen).
  - `id` es un ULID con prefijo `evt_` — se genera automáticamente si
    no se pasa.
  - `occurred_at` es el timestamp del HECHO (no de la publicación).
  - `tenant_id` obligatorio salvo eventos de plataforma (`platform.*`).
  - `type` sigue el naming `<context>.<entity>.<action>` en pasado.
  - `context.trigger_event_id` permite trazar cadenas causales.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.platform.ids import new_id


class ActorKind(str, Enum):
    """Naturaleza del actor que emite el evento."""

    SYSTEM = "system"
    MEMBER = "member"
    CUSTOMER = "customer"
    RULE = "rule"
    CAMPAIGN = "campaign"


class Actor(BaseModel):
    """Quién causó el evento."""

    model_config = ConfigDict(frozen=True)

    kind: ActorKind
    id: int | str | None = None
    on_behalf_of: int | str | None = None


class Subject(BaseModel):
    """Recurso principal sobre el que trata el evento."""

    model_config = ConfigDict(frozen=True)

    kind: str  # customer, wallet, reward, ticket, campaign, ...
    id: int | str | None = None

    @field_validator("kind")
    @classmethod
    def _kind_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Subject.kind no puede estar vacío")
        return v.strip().lower()


class EventContext(BaseModel):
    """Contexto de correlación y causalidad."""

    model_config = ConfigDict(frozen=True)

    request_id: str | None = None
    session_id: str | None = None
    trigger_event_id: str | None = None
    causation_depth: int = 0


class Event(BaseModel):
    """Evento canónico del bus interno.

    Se emite con `bus.publish(event, db)` dentro de la transacción del
    cambio de estado que lo justifica. El dispatcher lo consume después.
    """

    model_config = ConfigDict(frozen=True)

    id: str = Field(default_factory=lambda: new_id("evt"))
    type: str
    version: int = 1
    occurred_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    tenant_id: int | None = None
    actor: Actor
    subject: Subject
    context: EventContext = Field(default_factory=EventContext)
    data: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None

    @field_validator("type")
    @classmethod
    def _type_shape(cls, v: str) -> str:
        # Naming: <context>.<entity>.<action> (2-3 niveles, snake_case).
        stripped = v.strip() if v else ""
        parts = stripped.split(".") if stripped else []
        if len(parts) < 2 or len(parts) > 3:
            raise ValueError(
                f"type inválido: {v!r} — debe tener 2-3 niveles separados por '.' "
                f"(ej. 'customer.identified', 'wallet.points.credited')"
            )
        for part in parts:
            if not part or not part.replace("_", "").isalnum() or not part.islower():
                raise ValueError(
                    f"type inválido: {v!r} — cada segmento debe ser snake_case ASCII"
                )
        return stripped

    @field_validator("id")
    @classmethod
    def _id_shape(cls, v: str) -> str:
        if not v.startswith("evt_"):
            raise ValueError(f"Event.id debe empezar con 'evt_', recibido {v!r}")
        return v
