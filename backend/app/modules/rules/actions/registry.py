"""Registro central de acciones ejecutables por el Rules Engine.

Diseño intencional: catálogo CERRADO. Solo entran acciones definidas
en código (con firma explícita) — nunca ejecutamos código arbitrario
declarado por el tenant. Ver docs/05-RULES_ENGINE.md sección
"catálogo de actions".

Uso desde otro módulo:

    from app.modules.rules.actions.registry import action_registry

    @action_registry.register("wallet.credit_points")
    async def credit_points(*, db, tenant_id, event, params, customer_id):
        ...
        return {"credited": 50}   # se guarda en RuleExecution.actions_applied
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.platform.events import Event

logger = logging.getLogger(__name__)


# Contrato de una action: recibe db, tenant_id, event, params ya
# resueltos (paths/exprs evaluados), customer_id derivado. Devuelve
# un dict opaco que va a `RuleExecution.actions_applied` para audit.
ActionCallable = Callable[
    ...,   # kwargs-only en la práctica
    Awaitable[dict[str, Any]],
]


class ActionRegistry:
    """Contenedor de actions con lookup por type."""

    def __init__(self) -> None:
        self._actions: dict[str, ActionCallable] = {}

    def register(
        self, action_type: str,
    ) -> Callable[[ActionCallable], ActionCallable]:
        """Decorator para registrar una action."""

        def decorator(func: ActionCallable) -> ActionCallable:
            if action_type in self._actions:
                logger.warning(
                    "action %r ya estaba registrada — sobrescribiendo",
                    action_type,
                )
            self._actions[action_type] = func
            return func

        return decorator

    def get(self, action_type: str) -> ActionCallable | None:
        return self._actions.get(action_type)

    def is_known(self, action_type: str) -> bool:
        return action_type in self._actions

    def all(self) -> list[str]:
        return sorted(self._actions.keys())

    def clear(self) -> None:
        """Solo para uso en tests."""
        self._actions.clear()


action_registry = ActionRegistry()
