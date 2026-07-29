"""Endpoints REST del módulo analytics — `/api/v1/analytics/*`."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.customer import Customer as _LegacyCustomer
from app.models.user import User, UserRole
from app.modules.analytics import (
    ActivityResponse,
    ChannelsResponse,
    HistogramResponse,
    KpisResponse,
    RulesLeaderboardResponse,
    TimelineResponse,
    TimeWindow,
    channels_breakdown,
    customer_timeline,
    events_histogram,
    kpis_snapshot,
    recent_activity,
    rules_leaderboard,
)


router = APIRouter(prefix="/api/v1/analytics", tags=["perks-analytics"])


def _require_scope(scope: TenantScope) -> int:
    if scope.tenant_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "SUPER_ADMIN debe seleccionar un tenant explícito",
        )
    return scope.tenant_id


@router.get("/activity", response_model=ActivityResponse)
async def get_activity(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    limit: int = Query(default=50, ge=1, le=200),
    before_id: int | None = Query(default=None, ge=1),
    type_prefix: str | None = Query(default=None, max_length=60),
    subject_kind: str | None = Query(default=None, max_length=40),
) -> ActivityResponse:
    tenant_id = _require_scope(scope)
    return await recent_activity(
        db,
        tenant_id=tenant_id,
        limit=limit,
        before_id=before_id,
        type_prefix=type_prefix,
        subject_kind=subject_kind,
    )


@router.get("/timeline/{customer_id}", response_model=TimelineResponse)
async def get_customer_timeline(
    customer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    limit: int = Query(default=100, ge=1, le=500),
) -> TimelineResponse:
    tenant_id = _require_scope(scope)
    # 404 si el customer no es del tenant.
    existing = await db.get(_LegacyCustomer, customer_id)
    if existing is None or existing.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "customer no encontrado")

    return await customer_timeline(
        db, tenant_id=tenant_id, customer_id=customer_id, limit=limit,
    )


@router.get("/kpis", response_model=KpisResponse)
async def get_kpis(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    window: TimeWindow = Query(default=TimeWindow.DAY),
) -> KpisResponse:
    tenant_id = _require_scope(scope)
    return await kpis_snapshot(db, tenant_id=tenant_id, window=window)


@router.get("/rules-leaderboard", response_model=RulesLeaderboardResponse)
async def get_rules_leaderboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    window: TimeWindow = Query(default=TimeWindow.WEEK),
    limit: int = Query(default=10, ge=1, le=50),
) -> RulesLeaderboardResponse:
    tenant_id = _require_scope(scope)
    return await rules_leaderboard(
        db, tenant_id=tenant_id, window=window, limit=limit,
    )


@router.get("/channels", response_model=ChannelsResponse)
async def get_channels(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    window: TimeWindow = Query(default=TimeWindow.WEEK),
) -> ChannelsResponse:
    tenant_id = _require_scope(scope)
    return await channels_breakdown(db, tenant_id=tenant_id, window=window)


@router.get("/events-histogram", response_model=HistogramResponse)
async def get_events_histogram(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[
        User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))
    ],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    window: TimeWindow = Query(default=TimeWindow.DAY),
    bucket: str = Query(default="hour", pattern="^(hour|day)$"),
) -> HistogramResponse:
    tenant_id = _require_scope(scope)
    return await events_histogram(
        db, tenant_id=tenant_id, window=window, bucket=bucket,
    )
