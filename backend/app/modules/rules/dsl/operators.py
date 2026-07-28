"""Operadores del DSL — funciones puras (path_value, target_value) → bool.

El diccionario `OPERATORS` es el catálogo cerrado. Agregar operador
nuevo requiere PR — mantiene la superficie del DSL estable y auditable.
"""
from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from app.modules.rules.errors import UnknownOperatorError


def _to_number(value: Any) -> float | None:
    """Coerción tolerante a numérico. Devuelve None si no aplica."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    try:
        return float(value)  # decimals, etc.
    except (TypeError, ValueError):
        return None


def _eq(a: Any, b: Any) -> bool:
    # Comparación numérica tolerante — "50" == 50 en DSL.
    na, nb = _to_number(a), _to_number(b)
    if na is not None and nb is not None:
        return na == nb
    return a == b


def _neq(a: Any, b: Any) -> bool:
    return not _eq(a, b)


def _cmp(op: str, a: Any, b: Any) -> bool:
    na, nb = _to_number(a), _to_number(b)
    if na is None or nb is None:
        return False
    if op == "gt":
        return na > nb
    if op == "gte":
        return na >= nb
    if op == "lt":
        return na < nb
    if op == "lte":
        return na <= nb
    raise UnknownOperatorError(op)


def _in(a: Any, b: Any) -> bool:
    if not isinstance(b, (list, tuple, set)):
        return False
    return a in b


def _not_in(a: Any, b: Any) -> bool:
    return not _in(a, b)


def _starts_with(a: Any, b: Any) -> bool:
    return isinstance(a, str) and isinstance(b, str) and a.startswith(b)


def _ends_with(a: Any, b: Any) -> bool:
    return isinstance(a, str) and isinstance(b, str) and a.endswith(b)


def _contains(a: Any, b: Any) -> bool:
    if isinstance(a, str) and isinstance(b, str):
        return b in a
    if isinstance(a, (list, tuple, set)):
        return b in a
    return False


def _matches(a: Any, b: Any) -> bool:
    if not isinstance(a, str) or not isinstance(b, str):
        return False
    try:
        return re.fullmatch(b, a) is not None
    except re.error:
        return False


def _exists(a: Any, _b: Any) -> bool:
    return a is not None


def _is_null(a: Any, _b: Any) -> bool:
    return a is None


def _is_empty(a: Any, _b: Any) -> bool:
    if a is None:
        return True
    if isinstance(a, (str, list, tuple, set, dict)):
        return len(a) == 0
    return False


OPERATORS: dict[str, Callable[[Any, Any], bool]] = {
    "eq": _eq,
    "neq": _neq,
    "gt": lambda a, b: _cmp("gt", a, b),
    "gte": lambda a, b: _cmp("gte", a, b),
    "lt": lambda a, b: _cmp("lt", a, b),
    "lte": lambda a, b: _cmp("lte", a, b),
    "in": _in,
    "not_in": _not_in,
    "starts_with": _starts_with,
    "ends_with": _ends_with,
    "contains": _contains,
    "matches": _matches,
    "exists": _exists,
    "is_null": _is_null,
    "is_empty": _is_empty,
}


def get_operator(name: str) -> Callable[[Any, Any], bool]:
    """Devuelve la función del operador o levanta UnknownOperatorError."""
    fn = OPERATORS.get(name)
    if fn is None:
        raise UnknownOperatorError(name)
    return fn
