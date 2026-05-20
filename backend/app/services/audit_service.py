from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    actor_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditLog:
    ip = None
    ua = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")

    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        metadata_json=metadata,
        ip_address=ip,
        user_agent=ua,
    )
    db.add(entry)
    await db.flush()
    return entry
