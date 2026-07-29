"""Renderer Mustache-like para plantillas de notificaciones.

Sintaxis:
  {{ path.to.value }}  → resuelve contra el context dict.

Ejemplos:
  "Hola {{ customer.full_name }}"        → "Hola Ana Torres"
  "Ganaste {{ data.points }} pts"        → "Ganaste 50 pts"
  "Hoy es {{ now.day_of_week }}"         → "Hoy es tuesday"

Namespaces esperados en el context:
  customer.*, event.*, data.*, wallet.*, tenant.*, now.*

Placeholders que no resuelven → string vacío + warning. Nunca lanza —
no queremos que un email fallido rompa el flujo de una compra.

Zero code execution — solo lookup en dict/objeto. Diseño intencional:
las templates NO son código.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}")


def _lookup(context: dict[str, Any], path: str) -> Any:
    """Navega `context` por 'a.b.c' y devuelve el valor o None."""
    parts = path.split(".")
    cur: Any = context
    for p in parts:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            cur = getattr(cur, p, None)
    return cur


def _now_dict() -> dict[str, Any]:
    """Snapshot temporal para paths `now.*`."""
    n = datetime.now(timezone.utc)
    names = [
        "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday",
    ]
    return {
        "iso": n.isoformat(),
        "day_of_week": names[n.weekday()],
        "hour": n.hour,
        "month": n.month,
        "day_of_month": n.day,
        "year": n.year,
    }


def build_context(
    *,
    customer: dict[str, Any] | None = None,
    event_data: dict[str, Any] | None = None,
    event_type: str | None = None,
    wallet: dict[str, Any] | None = None,
    tenant: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Arma el context estándar consumido por render()."""
    ctx: dict[str, Any] = {
        "customer": customer or {},
        "data": event_data or {},
        "event": {"type": event_type} if event_type else {},
        "wallet": wallet or {},
        "tenant": tenant or {},
        "now": _now_dict(),
    }
    if extra:
        ctx.update(extra)
    return ctx


def render(template: str | None, context: dict[str, Any]) -> str:
    """Reemplaza placeholders del template con valores del context.

    None/'' → '' (no rompe). Placeholders no resueltos → cadena vacía
    + warning en logs para debug.
    """
    if not template:
        return ""

    def _replace(match: re.Match[str]) -> str:
        path = match.group(1)
        value = _lookup(context, path)
        if value is None:
            logger.warning("placeholder no resuelto en template: %r", path)
            return ""
        return str(value)

    return _PLACEHOLDER_RE.sub(_replace, template)
