"""Endpoints REST del módulo notifications — /api/v1/notifications/*.

CRUD de templates + envío manual + feed de deliveries. Auth
ADMIN/SUPER_ADMIN + gated por `perks.admin_api`.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.user import User, UserRole
from app.modules.notifications import (
    DeliveryOut,
    DuplicateTemplateError,
    MissingDestinationError,
    NotificationChannel,
    ProviderNotConfiguredError,
    ProviderSendError,
    SendRequest,
    TemplateIn,
    TemplateNotFoundError,
    TemplateOut,
    delete_template as delete_template_svc,
    list_deliveries as list_deliveries_svc,
    list_templates as list_templates_svc,
    send as send_svc,
    upsert_template as upsert_template_svc,
)
from app.modules.platform.events import Actor, ActorKind


router = APIRouter(prefix="/api/v1/notifications", tags=["perks-notifications"])


class TemplateListResponse(BaseModel):
    items: list[TemplateOut]


class DeliveriesResponse(BaseModel):
    items: list[DeliveryOut]


def _actor(member: User) -> Actor:
    return Actor(kind=ActorKind.MEMBER, id=member.id)


def _translate(exc: Exception) -> HTTPException:
    if isinstance(exc, TemplateNotFoundError):
        return HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={
                "code": "template_not_found",
                "message": str(exc),
            },
        )
    if isinstance(exc, DuplicateTemplateError):
        return HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"code": "duplicate_template", "message": str(exc)},
        )
    if isinstance(exc, MissingDestinationError):
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "missing_destination", "message": str(exc)},
        )
    if isinstance(exc, ProviderNotConfiguredError):
        return HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "provider_not_configured",
                "message": str(exc),
            },
        )
    if isinstance(exc, ProviderSendError):
        return HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"code": "provider_send_failed", "message": str(exc)},
        )
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ────────────────────────────────────────────────────────────────
# Templates
# ────────────────────────────────────────────────────────────────


@router.get("/templates", response_model=TemplateListResponse)
async def list_templates(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    channel: NotificationChannel | None = Query(default=None),
) -> TemplateListResponse:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    rows = await list_templates_svc(
        db, tenant_id=scope.tenant_id, channel=channel,
    )
    return TemplateListResponse(
        items=[TemplateOut.model_validate(r) for r in rows],
    )


@router.put("/templates", response_model=TemplateOut)
async def upsert_template(
    payload: TemplateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> TemplateOut:
    """PUT idempotente por (key, channel)."""
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    try:
        row = await upsert_template_svc(
            db, tenant_id=scope.tenant_id, payload=payload, actor=_actor(actor),
        )
    except Exception as exc:
        raise _translate(exc) from exc
    await db.commit()
    return TemplateOut.model_validate(row)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> None:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    ok = await delete_template_svc(
        db, tenant_id=scope.tenant_id, template_id=template_id, actor=_actor(actor),
    )
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template no encontrado")
    await db.commit()


# ────────────────────────────────────────────────────────────────
# Send (manual)
# ────────────────────────────────────────────────────────────────


@router.post(
    "/send",
    response_model=DeliveryOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_manual(
    payload: SendRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> DeliveryOut:
    """Envío directo desde el panel — útil para pruebas, avisos
    puntuales, campañas one-shot que no ameritan crear una regla."""
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    try:
        delivery = await send_svc(
            db, tenant_id=scope.tenant_id, actor=_actor(actor), req=payload,
        )
    except Exception as exc:
        raise _translate(exc) from exc
    await db.commit()
    return DeliveryOut.model_validate(delivery)


# ────────────────────────────────────────────────────────────────
# Deliveries feed
# ────────────────────────────────────────────────────────────────


@router.get("/deliveries", response_model=DeliveriesResponse)
async def list_deliveries(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    customer_id: int | None = Query(default=None),
    channel: NotificationChannel | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> DeliveriesResponse:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    rows = await list_deliveries_svc(
        db,
        tenant_id=scope.tenant_id,
        customer_id=customer_id,
        channel=channel,
        limit=limit,
    )
    return DeliveriesResponse(
        items=[DeliveryOut.model_validate(r) for r in rows],
    )
