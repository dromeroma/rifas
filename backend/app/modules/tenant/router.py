"""Endpoints REST del módulo tenant — `/api/v1/tenant/*`.

Registrado en main.py bajo el flag `perks.admin_api`. Auth
ADMIN/SUPER_ADMIN + tenant scope obligatorios.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.user import User, UserRole
from app.modules.platform.events import Actor, ActorKind
from app.modules.tenant import (
    ProfileIn,
    ProfileOut,
    get_or_create_profile,
    pause_tenant,
    update_profile,
)


router = APIRouter(prefix="/api/v1/tenant", tags=["perks-tenant"])


def _actor_from_member(member: User) -> Actor:
    return Actor(kind=ActorKind.MEMBER, id=member.id)


def _require_scope(scope: TenantScope) -> int:
    if scope.tenant_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "SUPER_ADMIN debe seleccionar un tenant explícito",
        )
    return scope.tenant_id


@router.get("/me/profile", response_model=ProfileOut)
async def get_my_profile(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> ProfileOut:
    """Devuelve (o crea con defaults) el perfil del tenant actual."""
    tenant_id = _require_scope(scope)
    profile = await get_or_create_profile(
        db, tenant_id=tenant_id, actor=_actor_from_member(actor),
    )
    await db.commit()
    return ProfileOut.model_validate(profile)


@router.put("/me/profile", response_model=ProfileOut)
async def update_my_profile(
    payload: ProfileIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> ProfileOut:
    """Patch semántica del perfil. Emite tenant.profile.updated si hubo cambios."""
    tenant_id = _require_scope(scope)
    profile = await update_profile(
        db,
        tenant_id=tenant_id,
        actor=_actor_from_member(actor),
        payload=payload,
    )
    await db.commit()
    return ProfileOut.model_validate(profile)


class PauseIn(BaseModel):
    reason: str | None = None


@router.post("/me/pause", response_model=ProfileOut)
async def pause_my_tenant(
    payload: PauseIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> ProfileOut:
    """Pausa el tenant. Idempotente."""
    tenant_id = _require_scope(scope)
    profile = await pause_tenant(
        db,
        tenant_id=tenant_id,
        actor=_actor_from_member(actor),
        reason=payload.reason,
    )
    await db.commit()
    return ProfileOut.model_validate(profile)
