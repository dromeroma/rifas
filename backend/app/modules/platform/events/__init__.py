"""platform.events — event bus interno de Savvy Perks.

Exporta la superficie mínima que otros módulos deben conocer:

  - Event, Actor, Subject, EventContext, ActorKind: envelope tipado.
  - publish(event, db): inserta un evento en el outbox dentro de la
    transacción actual.
  - registry.on(event_type): decorator para suscribir un handler.
  - Dispatcher: worker asíncrono que consume el outbox.
  - EventOutbox, EventHandled, OutboxStatus, HandledStatus: modelos ORM.

Ver docs/04-EVENTS.md para el modelo completo.
"""
from app.modules.platform.events.bus import publish, registry
from app.modules.platform.events.dispatcher import Dispatcher
from app.modules.platform.events.envelope import (
    Actor,
    ActorKind,
    Event,
    EventContext,
    Subject,
)
from app.modules.platform.events.errors import (
    EventBusError,
    HandlerFailedError,
    LoopDetectedError,
)
from app.modules.platform.events.models import (
    EventHandled,
    EventOutbox,
    HandledStatus,
    OutboxStatus,
)

__all__ = [
    "Actor",
    "ActorKind",
    "Dispatcher",
    "Event",
    "EventBusError",
    "EventContext",
    "EventHandled",
    "EventOutbox",
    "HandledStatus",
    "HandlerFailedError",
    "LoopDetectedError",
    "OutboxStatus",
    "Subject",
    "publish",
    "registry",
]
