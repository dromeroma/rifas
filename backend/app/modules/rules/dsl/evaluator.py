"""Evaluador del DSL — junta paths + operators + expressions.

Entrada:
  - `EvaluationContext` con event + snapshots lazy de customer/wallet/
    tenant + timestamp `now`.
  - Condition tree (all/any/not/predicate) del DSL.

Salida:
  - bool para evaluate_condition.
  - dict de params resueltos para resolve_action_params.

Snapshot lazy: si la condición no referencia `customer.*`, no
disparamos la query — mantiene el motor rápido para reglas simples.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.modules.rules.dsl.expressions import evaluate_expression
from app.modules.rules.dsl.operators import get_operator
from app.modules.rules.dsl.paths import resolve_path

if TYPE_CHECKING:
    from datetime import datetime

    from app.modules.platform.events import Event


@dataclass
class EvaluationContext:
    """Contexto pasado al evaluador.

    `customer_data` / `wallet_data` / `tenant_data` son snapshots
    pre-cargados por el service (o vacíos en dry-run).

    `now` es el timestamp de evaluación — se pasa explícito para
    tests determinísticos.
    """

    event: "Event"
    customer_data: dict[str, Any] = field(default_factory=dict)
    wallet_data: dict[str, Any] = field(default_factory=dict)
    tenant_data: dict[str, Any] = field(default_factory=dict)
    now: "datetime | None" = None
    # Para debug/dry-run: los paths resueltos durante la evaluación.
    resolved_paths: dict[str, Any] = field(default_factory=dict)

    def resolve(self, path: str) -> Any:
        value = resolve_path(path, self)
        self.resolved_paths[path] = value
        return value


def _evaluate_predicate(pred: dict, ctx: EvaluationContext) -> bool:
    path = pred.get("path")
    op = pred.get("op")
    target = pred.get("value")
    if not path or not op:
        return False
    lhs = ctx.resolve(path)
    fn = get_operator(op)
    return bool(fn(lhs, target))


def _is_group(node: Any) -> bool:
    return isinstance(node, dict) and (
        "all" in node or "any" in node or "not" in node
    )


def evaluate_condition(node: Any, ctx: EvaluationContext) -> bool:
    """Evalúa recursivamente all/any/not/predicate.

    - node = None → True (sin condiciones = siempre pasa).
    - node = {all: [...]} → AND.
    - node = {any: [...]} → OR.
    - node = {not: {...}} → NOT.
    - node = {path, op, value} → predicado hoja.
    """
    if node is None:
        return True

    # Modelos Pydantic o dicts — normalizamos a dict.
    if hasattr(node, "model_dump"):
        node = node.model_dump(by_alias=True)

    if _is_group(node):
        if node.get("all"):
            return all(evaluate_condition(c, ctx) for c in node["all"])
        if node.get("any"):
            return any(evaluate_condition(c, ctx) for c in node["any"])
        if node.get("not") is not None:
            return not evaluate_condition(node["not"], ctx)
        return True

    if isinstance(node, dict) and "path" in node:
        return _evaluate_predicate(node, ctx)

    return False


def _resolve_value(value: Any, ctx: EvaluationContext) -> Any:
    """Coerción recursiva de un valor de params.

    - dict → aplica recursivo a cada value.
    - list/tuple → aplica recursivo a cada elemento.
    - str con prefijo `expr:` → parsea + evalúa como expresión.
    - str con prefijo `path:` → resuelve como path.
    - resto → devuelve tal cual.
    """
    if isinstance(value, dict):
        return {k: _resolve_value(v, ctx) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_resolve_value(v, ctx) for v in value]
    if isinstance(value, str):
        if value.startswith("expr:"):
            return evaluate_expression(value[len("expr:"):].strip(), ctx)
        if value.startswith("path:"):
            return ctx.resolve(value[len("path:"):].strip())
    return value


def resolve_action_params(
    params: dict[str, Any], ctx: EvaluationContext,
) -> dict[str, Any]:
    """Coerciona todos los valores de un dict de params.

    Uso: el service, antes de invocar la action, llama a esto para
    convertir strings `expr:...` / `path:...` en sus valores finales.
    """
    return _resolve_value(params or {}, ctx)


def timed_evaluation() -> "TimedContext":
    """Helper para medir latencia de una evaluación."""
    return TimedContext()


class TimedContext:
    def __init__(self) -> None:
        self.start = 0.0
        self.end = 0.0

    def __enter__(self) -> "TimedContext":
        self.start = time.perf_counter()
        return self

    def __exit__(self, *_: Any) -> None:
        self.end = time.perf_counter()

    @property
    def latency_ms(self) -> int:
        return int((self.end - self.start) * 1000)
