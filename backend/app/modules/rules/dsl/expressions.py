"""Mini parser AST para expresiones aritméticas del DSL.

Usado en `params.amount_expr` de las actions — ej. dar puntos =
`floor(data.amount_cop / 1000)`.

Sandbox estricto: sólo permitimos un subset explícito del AST de
Python. Cualquier otro nodo levanta UnsafeExpressionError.

Permitidos:
  - Constants numéricos y strings.
  - Names (resueltos con `paths.resolve_path`).
  - BinOp: +, -, *, /, //, %.
  - UnaryOp: -x, +x.
  - Call a funciones whitelisted: floor, ceil, round, min, max, abs,
    int, float, concat.
  - Compare: eq, gt, gte, lt, lte, neq (evaluados como bool).
  - BoolOp: and, or.

Prohibidos:
  - Attribute access (`foo.bar` — la resolución de path se hace por
    el propio Name, no por Attribute).
  - Subscripts.
  - Comprehensions y generators.
  - Lambdas, funciones anidadas, imports.
  - Named expressions (walrus).
"""
from __future__ import annotations

import ast
from typing import Any, Callable, TYPE_CHECKING

from app.modules.rules.errors import (
    ExpressionSyntaxError,
    UnsafeExpressionError,
)

if TYPE_CHECKING:
    from app.modules.rules.dsl.evaluator import EvaluationContext


def _fn_concat(*parts: Any) -> str:
    return "".join(str(p) for p in parts if p is not None)


ALLOWED_FUNCTIONS: dict[str, Callable[..., Any]] = {
    "floor": lambda x: int(x) if x >= 0 else -int(-x + 0.999999),
    "ceil": lambda x: -int(-x) if not float(x).is_integer() else int(x),
    "round": lambda x, n=0: round(x, int(n)) if n else round(x),
    "min": lambda *args: min(*args) if args else 0,
    "max": lambda *args: max(*args) if args else 0,
    "abs": abs,
    "int": lambda x: int(x),
    "float": lambda x: float(x),
    "concat": _fn_concat,
}


def _evaluate_node(node: ast.AST, ctx: "EvaluationContext") -> Any:
    """Evaluación recursiva del AST — un caso por tipo permitido."""
    # Import tardío para evitar circular.
    from app.modules.rules.dsl.paths import resolve_path

    if isinstance(node, ast.Constant):
        return node.value

    if isinstance(node, ast.Name):
        # El name se interpreta como path. Ejemplo: `data` no basta —
        # el DSL usa nombres completos tipo `data.amount_cop` pero
        # Python parse convierte eso en Attribute. Lo manejamos abajo.
        return resolve_path(node.id, ctx)

    if isinstance(node, ast.Attribute):
        # Reconstruye el path completo: nombres encadenados por puntos.
        parts: list[str] = []
        cur: ast.AST = node
        while isinstance(cur, ast.Attribute):
            parts.append(cur.attr)
            cur = cur.value
        if not isinstance(cur, ast.Name):
            raise UnsafeExpressionError(
                "attribute access solo permitido sobre paths (namespace.field)"
            )
        parts.append(cur.id)
        parts.reverse()
        return resolve_path(".".join(parts), ctx)

    if isinstance(node, ast.BinOp):
        left = _evaluate_node(node.left, ctx)
        right = _evaluate_node(node.right, ctx)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.FloorDiv):
            return left // right
        if isinstance(node.op, ast.Mod):
            return left % right
        raise UnsafeExpressionError(f"operador binario no permitido: {node.op!r}")

    if isinstance(node, ast.UnaryOp):
        v = _evaluate_node(node.operand, ctx)
        if isinstance(node.op, ast.USub):
            return -v
        if isinstance(node.op, ast.UAdd):
            return +v
        raise UnsafeExpressionError(f"operador unario no permitido: {node.op!r}")

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise UnsafeExpressionError(
                "call solo permitido sobre funciones whitelisted"
            )
        fn_name = node.func.id
        fn = ALLOWED_FUNCTIONS.get(fn_name)
        if fn is None:
            raise UnsafeExpressionError(f"función {fn_name!r} no está whitelisted")
        if node.keywords:
            raise UnsafeExpressionError("kwargs no permitidos en llamadas del DSL")
        args = [_evaluate_node(a, ctx) for a in node.args]
        return fn(*args)

    if isinstance(node, ast.BoolOp):
        vals = [_evaluate_node(v, ctx) for v in node.values]
        if isinstance(node.op, ast.And):
            return all(vals)
        if isinstance(node.op, ast.Or):
            return any(vals)
        raise UnsafeExpressionError(f"boolop no permitido: {node.op!r}")

    if isinstance(node, ast.Compare):
        # Sólo comparaciones simples (una operación).
        if len(node.ops) != 1 or len(node.comparators) != 1:
            raise UnsafeExpressionError(
                "compares encadenados (a < b < c) no permitidos"
            )
        left = _evaluate_node(node.left, ctx)
        right = _evaluate_node(node.comparators[0], ctx)
        op = node.ops[0]
        if isinstance(op, ast.Eq):
            return left == right
        if isinstance(op, ast.NotEq):
            return left != right
        if isinstance(op, ast.Lt):
            return left < right
        if isinstance(op, ast.LtE):
            return left <= right
        if isinstance(op, ast.Gt):
            return left > right
        if isinstance(op, ast.GtE):
            return left >= right
        raise UnsafeExpressionError(f"compare no permitido: {op!r}")

    if isinstance(node, ast.List):
        return [_evaluate_node(e, ctx) for e in node.elts]

    if isinstance(node, ast.Tuple):
        return tuple(_evaluate_node(e, ctx) for e in node.elts)

    raise UnsafeExpressionError(f"nodo AST no permitido: {type(node).__name__}")


def evaluate_expression(expr: str, ctx: "EvaluationContext") -> Any:
    """Parsea + evalúa una expresión aritmética del DSL."""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as e:
        raise ExpressionSyntaxError(f"sintaxis inválida en {expr!r}: {e}") from e
    return _evaluate_node(tree.body, ctx)
