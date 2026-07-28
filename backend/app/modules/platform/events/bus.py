"""Bus interface — publish + registry de handlers.

Uso desde un módulo emisor:

    from app.modules.platform.events import Event, Actor, ActorKind, Subject, publish

    async def confirm_purchase(db, order):
        # ... lógica de negocio ...
        await publish(
            Event(
                type="pos.sale.completed",
                tenant_id=order.tenant_id,
                actor=Actor(kind=ActorKind.SYSTEM),
                subject=Subject(kind="sale", id=order.id),
                data={"amount_cop": order.total, "channel": order.channel},
            ),
            db,
        )
        await db.commit()  # el evento entra al outbox atómicamente

Uso desde un módulo receptor:

    from app.modules.platform.events import registry, Event

    @registry.on("pos.sale.completed")
    async def credit_points_for_sale(event: Event, db) -> None:
        ...

`registry.on` es idempotente para un mismo (event_type, handler_id).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from sqlalchemy import insert

from app.modules.platform.events.envelope import Event
from app.modules.platform.events.errors import LoopDetectedError
from app.modules.platform.events.models import EventOutbox

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Cada evento hijo emitido por un handler propaga context.trigger_event_id
# + incrementa causation_depth. Este cap frena reglas mal escritas antes
# de que consuman el sistema.
MAX_CAUSATION_DEPTH = 20

Handler = Callable[[Event, "AsyncSession"], Awaitable[None]]


WILDCARD_EVENT_TYPE = "*"


class EventRegistry:
    """Registro in-process de handlers por tipo de evento.

    Múltiples handlers pueden registrarse para el mismo tipo. Cada uno
    se identifica por `handler_id` — nombre estable que usa el
    dispatcher para trazabilidad e idempotencia en `event_handled`.

    Wildcard: `@registry.on("*")` registra un handler que recibe TODOS
    los eventos. Uso principal: el rules_engine que evalúa reglas del
    tenant contra cualquier evento entrante. Los wildcard handlers se
    ejecutan DESPUÉS de los específicos.
    """

    def __init__(self) -> None:
        # tipo → lista de (handler_id, handler_fn)
        self._handlers: dict[str, list[tuple[str, Handler]]] = defaultdict(list)
        self._wildcard: list[tuple[str, Handler]] = []

    def on(
        self,
        event_type: str,
        *,
        handler_id: str | None = None,
    ) -> Callable[[Handler], Handler]:
        """Decorator para suscribir un handler a un tipo de evento.

        Si `handler_id` no se pasa, se deriva como `module.function`.
        Registrar el mismo (event_type, handler_id) dos veces es
        idempotente: sobrescribe la referencia y loguea warning.

        Usa `event_type="*"` para suscribir un handler universal.
        """

        def decorator(func: Handler) -> Handler:
            hid = handler_id or f"{func.__module__}.{func.__qualname__}"
            bucket = (
                self._wildcard
                if event_type == WILDCARD_EVENT_TYPE
                else self._handlers[event_type]
            )
            for i, (registered_id, _) in enumerate(bucket):
                if registered_id == hid:
                    logger.warning(
                        "handler %r ya estaba registrado para %r — sobrescribiendo",
                        hid,
                        event_type,
                    )
                    bucket[i] = (hid, func)
                    return func
            bucket.append((hid, func))
            logger.debug("registrado handler %r para %r", hid, event_type)
            return func

        return decorator

    def handlers_for(self, event_type: str) -> list[tuple[str, Handler]]:
        """Handlers específicos + wildcard, en ese orden.

        Los específicos corren primero (patrón "más específico gana");
        los wildcard corren después. Los handler_id son únicos entre
        ambos grupos por convención de naming (`<module>.<action>`).
        """
        specific = list(self._handlers.get(event_type, []))
        return specific + list(self._wildcard)

    def clear(self) -> None:
        """Vacía el registro. Para uso solo en tests."""
        self._handlers.clear()
        self._wildcard.clear()


# Registro global — cada import de un módulo con handlers agrega al mismo.
registry = EventRegistry()


async def publish(event: Event, db: "AsyncSession") -> EventOutbox:
    """Persiste un evento en el outbox dentro de la transacción actual.

    NO despacha el evento — de eso se encarga el dispatcher asincrónico.
    NO hace commit — el llamante decide cuándo. Si la transacción hace
    rollback, el evento nunca existió (atomicidad garantizada).

    Levanta LoopDetectedError si `context.causation_depth` excede
    MAX_CAUSATION_DEPTH — protección contra reglas que se disparan a sí
    mismas.
    """
    if event.context.causation_depth > MAX_CAUSATION_DEPTH:
        raise LoopDetectedError(
            event.id,
            event.context.causation_depth,
            MAX_CAUSATION_DEPTH,
        )

    payload = {
        "event_id": event.id,
        "type": event.type,
        "version": event.version,
        "tenant_id": event.tenant_id,
        "occurred_at": event.occurred_at,
        "actor": event.actor.model_dump(mode="json"),
        "subject": event.subject.model_dump(mode="json"),
        "context": event.context.model_dump(mode="json"),
        "data": event.data,
        "idempotency_key": event.idempotency_key,
    }

    result = await db.execute(
        insert(EventOutbox).values(**payload).returning(EventOutbox)
    )
    row: EventOutbox = result.scalar_one()
    logger.debug(
        "outbox row created id=%s event_id=%s type=%s",
        row.id,
        event.id,
        event.type,
    )
    return row
