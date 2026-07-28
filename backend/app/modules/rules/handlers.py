"""Handler universal del Rules Engine.

Se suscribe al wildcard `*` — recibe todos los eventos del bus y
delega en `service.evaluate_rules(db, event)`.

El servicio se encarga internamente de:
  - Filtrar auto-invocación (eventos `rules.*`).
  - Buscar reglas aplicables al event_type.
  - Aplicar limits + cooldown.
  - Evaluar condiciones.
  - Ejecutar actions.
  - Publicar `rules.rule.fired/skipped/errored`.

Este handler es idempotente por diseño del bus: el dispatcher marca
(event_id, handler_id) en event_handled → segunda entrega no vuelve a
correr. `evaluate_rules` en sí mismo escribe RuleExecution appends —
si por algún camino se corriera dos veces, habría duplicados de
execution en la BD (pero el guardado de event_handled del dispatcher
previene ese caso).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.modules.platform.events import Event, WILDCARD_EVENT_TYPE, registry
from app.modules.rules.service import evaluate_rules

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@registry.on(
    WILDCARD_EVENT_TYPE,
    handler_id="rules.evaluate_on_any_event",
)
async def evaluate_rules_on_any_event(
    event: Event, db: "AsyncSession",
) -> None:
    """Dispara la evaluación de reglas para cualquier evento entrante."""
    await evaluate_rules(db, event=event)
