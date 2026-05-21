from datetime import datetime
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole

router = APIRouter(prefix="/audit-logs", tags=["audit"])


class AuditActor(BaseModel):
    id: int
    full_name: str
    email: str


class AuditLogOut(BaseModel):
    id: int
    actor_id: Optional[int]
    actor: Optional[AuditActor]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    description: Optional[str]
    metadata_json: Optional[dict]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime


class AuditPage(BaseModel):
    items: List[AuditLogOut]
    total: int
    page: int
    page_size: int


@router.get("", response_model=AuditPage)
async def list_audit(
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    action: Optional[str] = Query(default=None, description="Filtra por acción exacta o prefijo (ej: payment.)"),
    actor_id: Optional[int] = None,
    entity_type: Optional[str] = None,
):
    # Query base. Si el actor pertenece a un tenant, restringimos los logs a
    # los de usuarios de ese mismo tenant.
    q = select(AuditLog)
    qc = select(func.count(AuditLog.id))

    if scope.tenant_id is not None:
        tenant_user_ids = select(User.id).where(User.tenant_id == scope.tenant_id)
        q = q.where(AuditLog.actor_id.in_(tenant_user_ids))
        qc = qc.where(AuditLog.actor_id.in_(tenant_user_ids))

    if action:
        if action.endswith("."):
            q = q.where(AuditLog.action.like(f"{action}%"))
            qc = qc.where(AuditLog.action.like(f"{action}%"))
        else:
            q = q.where(AuditLog.action == action)
            qc = qc.where(AuditLog.action == action)
    if actor_id is not None:
        q = q.where(AuditLog.actor_id == actor_id)
        qc = qc.where(AuditLog.actor_id == actor_id)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
        qc = qc.where(AuditLog.entity_type == entity_type)

    total = (await db.execute(qc)).scalar_one()
    q = q.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    logs = (await db.execute(q)).scalars().all()

    # Enriquecer con datos del actor en consulta batch
    actor_ids = list({l.actor_id for l in logs if l.actor_id})
    actors = {}
    if actor_ids:
        users = (await db.execute(select(User).where(User.id.in_(actor_ids)))).scalars().all()
        actors = {
            u.id: AuditActor(id=u.id, full_name=u.full_name, email=u.email) for u in users
        }

    items = [
        AuditLogOut(
            id=l.id,
            actor_id=l.actor_id,
            actor=actors.get(l.actor_id) if l.actor_id else None,
            action=l.action,
            entity_type=l.entity_type,
            entity_id=l.entity_id,
            description=l.description,
            metadata_json=l.metadata_json,
            ip_address=l.ip_address,
            user_agent=l.user_agent,
            created_at=l.created_at,
        )
        for l in logs
    ]
    return AuditPage(items=items, total=total, page=page, page_size=page_size)
