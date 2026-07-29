"""Módulo audit — bitácora inmutable de acciones administrativas.

Estrategia de captura:
  El audit log es una VISTA persistente sobre el event_bus. Un
  handler wildcard (`@registry.on("*")`) filtra los eventos que
  representan acciones administrativas y persiste un registro en
  `audit_logs`. Ventajas:

    · Cero cambios en los services de otros módulos.
    · Idempotente: (source_event_id, tenant_id) es unique — el
      dispatcher puede reintentar sin duplicar.
    · Cadena causal preservada: `context.trigger_event_id` se copia
      al audit log, permitiendo trace-back completo.

Qué se captura:
  · TODA acción con actor.kind == MEMBER (humano por CTA en el panel).
  · SISTEMA solo para eventos de alto valor auditable:
      tenant.activated, tenant.paused, onboarding.tenant.completed,
      rules.rule.errored (indica falla operativa a investigar).

Qué NO se captura (por decisión):
  · customer.identified (potencial flood en integraciones), a menos
    que el actor sea MEMBER (identify manual desde el panel).
  · notifications.message.* (ya se ve en analytics; el contenido
    puede tener PII y crecería fuera de control).
  · onboarding.step.completed cuando actor.kind == SYSTEM (auto por bus).

Contrato:
  · Los datos en `changes` son un snapshot minificado — nunca
    almacenamos body renderizado de notifications, ni PII cruda.
  · Retención: append-only. El delete por retention policy vive
    en un job separado (fuera del alcance de Sprint 10).
"""
from __future__ import annotations

from app.modules.audit import handlers as _handlers  # noqa: F401 side effect
from app.modules.audit.errors import AuditModuleError
from app.modules.audit.events import AUDIT_ENTRY_RECORDED
from app.modules.audit.models import AuditLog, AuditSeverity
from app.modules.audit.schemas import (
    AuditLogOut,
    AuditLogResponse,
)
from app.modules.audit.service import (
    list_entries,
    record,
)

__all__ = [
    "AUDIT_ENTRY_RECORDED",
    "AuditLog",
    "AuditLogOut",
    "AuditLogResponse",
    "AuditModuleError",
    "AuditSeverity",
    "list_entries",
    "record",
]
