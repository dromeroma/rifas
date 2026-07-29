"""Endpoints REST del módulo onboarding — `/api/v1/onboarding/*`.

Registrado en main.py bajo el flag `perks.admin_api`. Auth
ADMIN/SUPER_ADMIN + tenant scope obligatorios.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.user import User, UserRole
from app.modules.onboarding import (
    ChecklistOut,
    OnboardingStepUnknownError,
    complete_step,
    get_checklist,
    reopen_step,
    request_activation,
    skip_step,
)
from app.modules.onboarding.schemas import ManualCompleteIn, SkipIn, StepOut
from app.modules.platform.events import Actor, ActorKind
from app.modules.tenant import (
    InvalidActivationError,
    ProfileOut,
)


router = APIRouter(prefix="/api/v1/onboarding", tags=["perks-onboarding"])


def _actor_from_member(member: User) -> Actor:
    return Actor(kind=ActorKind.MEMBER, id=member.id)


def _require_scope(scope: TenantScope) -> int:
    if scope.tenant_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "SUPER_ADMIN debe seleccionar un tenant explícito",
        )
    return scope.tenant_id


def _step_out(row, defn) -> StepOut:
    return StepOut(
        key=defn.key,
        title=defn.title,
        description=defn.description,
        required=defn.required,
        weight=defn.weight,
        cta=defn.cta,
        status=row.status,
        completed_at=row.completed_at,
        completed_by=row.completed_by,
        trigger_event_id=row.trigger_event_id,
        meta=row.meta or {},
    )


@router.get("", response_model=ChecklistOut)
async def get_onboarding_checklist(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> ChecklistOut:
    """Snapshot del checklist del tenant actual."""
    tenant_id = _require_scope(scope)
    checklist = await get_checklist(db, tenant_id=tenant_id)
    await db.commit()   # bootstrap puede haber creado filas
    return checklist


@router.post("/steps/{key}/complete", response_model=StepOut)
async def manually_complete_step(
    key: str,
    payload: ManualCompleteIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> StepOut:
    tenant_id = _require_scope(scope)
    try:
        row = await complete_step(
            db,
            tenant_id=tenant_id,
            key=key,
            actor=_actor_from_member(actor),
            meta=payload.meta,
        )
    except OnboardingStepUnknownError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "step_unknown", "key": exc.key},
        )
    await db.commit()
    from app.modules.onboarding.steps import DEFAULT_STEPS_BY_KEY

    return _step_out(row, DEFAULT_STEPS_BY_KEY[key])


@router.post("/steps/{key}/skip", response_model=StepOut)
async def skip_onboarding_step(
    key: str,
    payload: SkipIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> StepOut:
    tenant_id = _require_scope(scope)
    try:
        row = await skip_step(
            db,
            tenant_id=tenant_id,
            key=key,
            actor=_actor_from_member(actor),
            reason=payload.reason,
        )
    except OnboardingStepUnknownError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "step_unknown", "key": exc.key},
        )
    await db.commit()
    from app.modules.onboarding.steps import DEFAULT_STEPS_BY_KEY

    return _step_out(row, DEFAULT_STEPS_BY_KEY[key])


@router.post("/steps/{key}/reopen", response_model=StepOut)
async def reopen_onboarding_step(
    key: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> StepOut:
    tenant_id = _require_scope(scope)
    try:
        row = await reopen_step(
            db,
            tenant_id=tenant_id,
            key=key,
            actor=_actor_from_member(actor),
        )
    except OnboardingStepUnknownError as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={"code": "step_unknown", "key": exc.key},
        )
    await db.commit()
    from app.modules.onboarding.steps import DEFAULT_STEPS_BY_KEY

    return _step_out(row, DEFAULT_STEPS_BY_KEY[key])


@router.post("/activate", response_model=ProfileOut)
async def activate(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> ProfileOut:
    """Solicita activación del tenant. 409 con detalle si faltan steps."""
    tenant_id = _require_scope(scope)
    try:
        profile = await request_activation(
            db,
            tenant_id=tenant_id,
            actor=_actor_from_member(actor),
        )
    except InvalidActivationError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "activation_blocked",
                "message": "faltan steps para activar",
                "missing": exc.missing,
            },
        )
    await db.commit()
    return ProfileOut.model_validate(profile)
