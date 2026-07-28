"""Resolución de paths del DSL contra el contexto de evaluación.

Namespaces soportados en Fase 1:

  data.*      → event.data (payload del evento)
  event.*     → campos top-level del evento (type, id, tenant_id,
                 occurred_at, actor, subject)
  customer.*  → snapshot del customer (nombre, tier, tags, custom_attrs)
  wallet.*    → snapshot de la wallet (balances por tipo, conteo vouchers)
  tenant.*    → config del tenant (slug, plan, timezone)
  now.*       → tiempo (iso, day_of_week, hour, month, day_of_month)

Cada namespace se carga lazy en `EvaluationContext` — un path que no
usa `customer.*` no dispara la query de customer.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _get_nested(root: Any, parts: list[str]) -> Any:
    """Navega un dict / objeto por lista de attrs. None si algo falta."""
    cur: Any = root
    for p in parts:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            cur = getattr(cur, p, None)
    return cur


def _now_field(field: str, now: datetime | None = None) -> Any:
    """Deriva campos temporales — todo en UTC salvo que un tenant
    configure timezone (V2)."""
    n = now if now is not None else datetime.now(timezone.utc)
    if field == "iso":
        return n.isoformat()
    if field == "day_of_week":
        # Python weekday(): lunes=0 ... domingo=6. Convertimos a nombre.
        names = [
            "monday", "tuesday", "wednesday", "thursday",
            "friday", "saturday", "sunday",
        ]
        return names[n.weekday()]
    if field == "hour":
        return n.hour
    if field == "month":
        return n.month
    if field == "day_of_month":
        return n.day
    if field == "year":
        return n.year
    if field == "epoch_ms":
        return int(n.timestamp() * 1000)
    return None


def resolve_path(path: str, ctx: "EvaluationContext") -> Any:  # noqa: F821
    """Resuelve una expresión `namespace.field.subfield`."""
    if not path or "." not in path:
        raise ValueError(f"path inválido: {path!r} — debe tener namespace")

    ns, _, rest = path.partition(".")
    parts = rest.split(".")

    if ns == "data":
        return _get_nested(ctx.event.data, parts)
    if ns == "event":
        # Top-level shortcuts.
        head = parts[0]
        if head == "type":
            return ctx.event.type
        if head == "id":
            return ctx.event.id
        if head == "tenant_id":
            return ctx.event.tenant_id
        if head == "occurred_at":
            return ctx.event.occurred_at.isoformat()
        if head in {"actor", "subject", "context"}:
            root = getattr(ctx.event, head).model_dump(mode="json")
            return _get_nested(root, parts[1:])
        if head == "idempotency_key":
            return ctx.event.idempotency_key
        return None
    if ns == "customer":
        return _get_nested(ctx.customer_data, parts)
    if ns == "wallet":
        return _get_nested(ctx.wallet_data, parts)
    if ns == "tenant":
        return _get_nested(ctx.tenant_data, parts)
    if ns == "now":
        return _now_field(parts[0], now=ctx.now)

    return None


# TYPE_CHECKING import evita ciclo con evaluator.
from typing import TYPE_CHECKING  # noqa: E402
if TYPE_CHECKING:
    from app.modules.rules.dsl.evaluator import EvaluationContext  # noqa: F401
