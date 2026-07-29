"""Service del módulo audit.

Dos APIs:

  record(...) — inserción idempotente. Puede llamarse manualmente
                desde otros services cuando el bus no basta (por ej.
                acciones que no emiten evento). Es idempotente por
                (tenant_id, source_event_id) via ON CONFLICT.

  list_entries(...) — feed keyset paginado con filtros comunes
                (action, actor, resource_kind, severity, ventana).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.modules.audit import events as audit_events
from app.modules.audit.models import AuditLog, AuditSeverity
from app.modules.audit.schemas import AuditLogOut, AuditLogResponse
from app.modules.platform.events import Actor, Event, Subject, publish

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ────────────────────────────────────────────────────────────────
# record
# ────────────────────────────────────────────────────────────────


async def record(
    db: "AsyncSession",
    *,
    tenant_id: int | None,
    actor: Actor,
    action: str,
    resource_kind: str | None = None,
    resource_id: str | None = None,
    changes: dict[str, Any] | None = None,
    reason: str | None = None,
    severity: AuditSeverity = AuditSeverity.INFO,
    source_event_id: str | None = None,
    trigger_event_id: str | None = None,
    occurred_at: datetime | None = None,
    emit_event: bool = True,
) -> AuditLog | None:
    """Inserta una fila en audit_logs.

    Retorna la fila creada, o None si el (tenant_id, source_event_id)
    ya existía (ON CONFLICT DO NOTHING — no error).

    Reglas:
      · actor_label se deriva como "kind:id" para display consistente.
      · occurred_at default = now UTC.
      · Cuando emit_event=False, el side-effect al bus se salta
        (útil cuando el propio handler audit está persistiendo un
        evento — evita loop).
    """
    actor_label = actor.kind.value
    if actor.id is not None:
        actor_label = f"{actor.kind.value}:{actor.id}"

    payload = {
        "tenant_id": tenant_id,
        "actor_kind": actor.kind.value,
        "actor_id": str(actor.id) if actor.id is not None else None,
        "actor_label": actor_label,
        "action": action,
        "severity": severity.value,
        "resource_kind": resource_kind,
        "resource_id": str(resource_id) if resource_id is not None else None,
        "changes": changes or {},
        "reason": reason,
        "source_event_id": source_event_id,
        "trigger_event_id": trigger_event_id,
        "occurred_at": occurred_at or datetime.now(timezone.utc),
    }

    stmt = (
        pg_insert(AuditLog)
        .values(**payload)
        .on_conflict_do_nothing(
            index_elements=["tenant_id", "source_event_id"],
        )
        .returning(AuditLog)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    if row is None:
        return None   # ya existía — nada que emitir

    if emit_event and tenant_id is not None:
        await publish(
            Event(
                type=audit_events.AUDIT_ENTRY_RECORDED,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="audit_log", id=row.id),
                data={
                    "action": action,
                    "resource_kind": resource_kind,
                    "resource_id": resource_id,
                    "severity": severity.value,
                },
            ),
            db,
        )

    return row


# ────────────────────────────────────────────────────────────────
# list_entries
# ────────────────────────────────────────────────────────────────


async def list_entries(
    db: "AsyncSession",
    *,
    tenant_id: int,
    limit: int = 50,
    before_id: int | None = None,
    action_prefix: str | None = None,
    actor_kind: str | None = None,
    actor_id: str | None = None,
    resource_kind: str | None = None,
    resource_id: str | None = None,
    severity: AuditSeverity | None = None,
    since: datetime | None = None,
) -> AuditLogResponse:
    """Feed cronológico DESC con filtros opcionales."""
    stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)

    if before_id is not None:
        stmt = stmt.where(AuditLog.id < before_id)
    if action_prefix:
        stmt = stmt.where(AuditLog.action.like(f"{action_prefix}%"))
    if actor_kind:
        stmt = stmt.where(AuditLog.actor_kind == actor_kind)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if resource_kind:
        stmt = stmt.where(AuditLog.resource_kind == resource_kind)
    if resource_id:
        stmt = stmt.where(AuditLog.resource_id == str(resource_id))
    if severity is not None:
        stmt = stmt.where(AuditLog.severity == severity)
    if since is not None:
        stmt = stmt.where(AuditLog.occurred_at >= since)

    stmt = stmt.order_by(AuditLog.id.desc()).limit(limit + 1)

    rows = list((await db.execute(stmt)).scalars().all())

    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [AuditLogOut.model_validate(r) for r in rows]
    next_cursor = rows[-1].id if has_more and rows else None

    return AuditLogResponse(
        items=items, next_before_id=next_cursor, limit=limit,
    )
