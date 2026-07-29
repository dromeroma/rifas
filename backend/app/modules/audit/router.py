"""Endpoints REST del módulo audit — `/api/v1/audit/*`."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.user import User, UserRole
from app.modules.audit import (
    AuditLogResponse,
    AuditSeverity,
    list_entries,
)


router = APIRouter(prefix="/api/v1/audit", tags=["perks-audit"])


def _require_scope(scope: TenantScope) -> int:
    if scope.tenant_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "SUPER_ADMIN debe seleccionar un tenant explícito",
        )
    return scope.tenant_id


@router.get("/log", response_model=AuditLogResponse)
async def get_audit_log(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    limit: int = Query(default=50, ge=1, le=200),
    before_id: int | None = Query(default=None, ge=1),
    action_prefix: str | None = Query(default=None, max_length=60),
    actor_kind: str | None = Query(default=None, max_length=20),
    actor_id: str | None = Query(default=None, max_length=80),
    resource_kind: str | None = Query(default=None, max_length=60),
    resource_id: str | None = Query(default=None, max_length=80),
    severity: AuditSeverity | None = Query(default=None),
    since: datetime | None = Query(default=None),
) -> AuditLogResponse:
    """Feed keyset paginado de audit_logs del tenant."""
    tenant_id = _require_scope(scope)
    return await list_entries(
        db,
        tenant_id=tenant_id,
        limit=limit,
        before_id=before_id,
        action_prefix=action_prefix,
        actor_kind=actor_kind,
        actor_id=actor_id,
        resource_kind=resource_kind,
        resource_id=resource_id,
        severity=severity,
        since=since,
    )
