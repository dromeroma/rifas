"""Handler wildcard del módulo audit — captura al vuelo.

Un único handler suscrito a `*` filtra el flujo de eventos del bus
y persiste una fila en `audit_logs` cuando el evento califica.

Reglas de captura:
  · MEMBER-actor → capturar SIEMPRE (acción humana).
  · SYSTEM-actor → capturar SOLO si `event.type` está en el
    whitelist `_SYSTEM_AUDIT_TYPES` (transiciones de alto valor).
  · RULE, CAMPAIGN, CUSTOMER actor → no capturar (ruido).

Diseño:
  · Fully idempotent: ON CONFLICT DO NOTHING en (tenant_id, source_event_id).
  · No mutates otras tablas — solo INSERT audit_logs + posible
    audit.entry.recorded event (para chaining futuro).
  · No re-audita audit.entry.recorded ni platform.* events —
    evita loops y noise.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.modules.audit import events as audit_events
from app.modules.audit.models import AuditSeverity
from app.modules.audit.service import record
from app.modules.platform.events import Actor, ActorKind, Event, registry
from app.modules.platform.events.bus import WILDCARD_EVENT_TYPE

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# Eventos SISTEMA que sí queremos en el audit log.
_SYSTEM_AUDIT_TYPES: frozenset[str] = frozenset({
    "tenant.activated",
    "tenant.paused",
    "onboarding.tenant.completed",
    "rules.rule.errored",
})

# Nunca auditar (evita loops y ruido).
_SKIP_PREFIXES: tuple[str, ...] = (
    "audit.",           # el propio módulo
    "platform.",        # infra housekeeping
)

# Prefijos que consideramos "cambios de configuración" — subimos su
# severity a NOTICE cuando el actor es humano.
_CONFIG_PREFIXES: tuple[str, ...] = (
    "rules.",
    "notifications.template.",
    "tenant.",
)


def _severity_for(event: Event) -> AuditSeverity:
    if event.type.endswith(".errored"):
        return AuditSeverity.WARN
    if event.type in ("tenant.activated", "onboarding.tenant.completed"):
        return AuditSeverity.NOTICE
    if event.type == "tenant.paused":
        return AuditSeverity.NOTICE
    for prefix in _CONFIG_PREFIXES:
        if event.type.startswith(prefix) and event.actor.kind is ActorKind.MEMBER:
            return AuditSeverity.NOTICE
    return AuditSeverity.INFO


def _should_capture(event: Event) -> bool:
    for prefix in _SKIP_PREFIXES:
        if event.type.startswith(prefix):
            return False
    if event.actor.kind is ActorKind.MEMBER:
        return True
    if event.actor.kind is ActorKind.SYSTEM:
        return event.type in _SYSTEM_AUDIT_TYPES
    return False


def _sanitize_changes(event: Event) -> dict:
    """Recorta payloads potencialmente sensibles antes de persistir.

    · Notificaciones: nunca guardamos body/subject renderizado — puede
      contener PII de mensajes. Guardamos solo metadatos.
    · Cualquier campo sospechoso de contener secreto (token, password,
      api_key) se enmascara.
    """
    data = dict(event.data or {})
    if event.type.startswith("notifications."):
        for pii in ("rendered_body", "rendered_subject", "body", "subject"):
            data.pop(pii, None)
    for k in list(data.keys()):
        low = k.lower()
        if any(sec in low for sec in ("token", "password", "secret", "api_key")):
            data[k] = "***"
    return data


@registry.on(
    WILDCARD_EVENT_TYPE,
    handler_id="audit.record_on_any_event",
)
async def record_on_any_event(event: Event, db: "AsyncSession") -> None:
    if not _should_capture(event):
        return

    subject_kind, subject_id = None, None
    if event.subject is not None:
        subject_kind = event.subject.kind
        subject_id = str(event.subject.id) if event.subject.id is not None else None

    trigger = None
    if event.context is not None:
        trigger = event.context.trigger_event_id

    await record(
        db,
        tenant_id=event.tenant_id,
        actor=event.actor,
        action=event.type,
        resource_kind=subject_kind,
        resource_id=subject_id,
        changes=_sanitize_changes(event),
        severity=_severity_for(event),
        source_event_id=event.id,
        trigger_event_id=trigger,
        occurred_at=event.occurred_at,
        # No emitimos audit.entry.recorded desde el handler para
        # evitar cadena infinita — el handler wildcard reprocesaría
        # ese evento. Solo record(...) manual desde services emite.
        emit_event=False,
    )


__all__ = ["record_on_any_event"]
