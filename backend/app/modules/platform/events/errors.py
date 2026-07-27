"""Excepciones del event bus."""
from __future__ import annotations


class EventBusError(Exception):
    """Base para errores del bus."""


class HandlerFailedError(EventBusError):
    """Un handler levantó una excepción al procesar un evento.

    Carga el event_id + handler_id + attempts en atributos para que
    el dispatcher decida retry / dead-letter.
    """

    def __init__(self, event_id: str, handler_id: str, cause: BaseException):
        self.event_id = event_id
        self.handler_id = handler_id
        self.cause = cause
        super().__init__(f"handler {handler_id} falló procesando {event_id}: {cause!r}")


class LoopDetectedError(EventBusError):
    """La cadena de eventos por causalidad excede el umbral configurado.

    Se lanza al publicar un evento cuyo `context.trigger_event_id` está
    en una cadena que ya tiene N eventos — probable regla mal escrita.
    """

    def __init__(self, event_id: str, chain_length: int, limit: int):
        self.event_id = event_id
        self.chain_length = chain_length
        self.limit = limit
        super().__init__(
            f"cadena causal de {chain_length} eventos excede el límite {limit} "
            f"al publicar {event_id}"
        )
