"""Pydantic schemas del módulo audit."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.modules.audit.models import AuditSeverity


class AuditLogOut(BaseModel):
    """Registro de audit tal como lo consume el UI."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int | None
    actor_kind: str
    actor_id: str | None
    actor_label: str
    action: str
    severity: AuditSeverity
    resource_kind: str | None
    resource_id: str | None
    changes: dict[str, Any]
    reason: str | None
    source_event_id: str | None
    trigger_event_id: str | None
    occurred_at: datetime
    created_at: datetime


class AuditLogResponse(BaseModel):
    """Feed paginado por keyset (id descendente)."""

    items: list[AuditLogOut]
    next_before_id: int | None
    limit: int
