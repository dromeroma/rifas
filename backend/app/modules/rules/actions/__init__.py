"""Actions del Rules Engine — catálogo cerrado, extensible por PR.

Cada action es una función asíncrona `(db, tenant_id, event, params,
customer_id) -> dict` que devuelve un resumen para la trazabilidad
en RuleExecution.actions_applied.

El registry es cerrado por diseño — el DSL nunca ejecuta código
arbitrario. Agregar acción nueva = agregar entrada al registry con
tipos claros.
"""
from app.modules.rules.actions.registry import (
    ActionCallable,
    ActionRegistry,
    action_registry,
)

# Import para side-effect: registra las acciones bundled.
from app.modules.rules.actions import wallet_actions  # noqa: F401


__all__ = [
    "ActionCallable",
    "ActionRegistry",
    "action_registry",
    "wallet_actions",
]
