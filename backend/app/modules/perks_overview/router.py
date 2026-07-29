"""Endpoint `/api/v1/overview` — KPIs del admin panel.

Devuelve un snapshot listo para el dashboard. Todas las queries
filtran por tenant scope y usan ventanas cortas para no sobrecargar
la BD.

Auth ADMIN/SUPER_ADMIN + gated por `perks.admin_api` (registrado en
main.py con Depends(require_perks_admin_api_enabled)).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.customer import Customer as _LegacyCustomer
from app.models.user import User, UserRole
from app.modules.platform.events.models import EventOutbox
from app.modules.rules.models import ExecutionStatus, Rule, RuleExecution
from app.modules.wallet.models import Wallet, WalletBalance


router = APIRouter(prefix="/api/v1/overview", tags=["perks-overview"])


# ────────────────────────────────────────────────────────────────
# Response models
# ────────────────────────────────────────────────────────────────


class CountersOut(BaseModel):
    customers_total: int
    wallets_total: int
    rules_total: int
    rules_active: int
    events_last_24h: int
    executions_last_7d: int
    executions_fired_last_7d: int
    executions_errored_last_7d: int


class TopRule(BaseModel):
    rule_id: int
    code: str
    name: str
    fires_last_7d: int


class RecentExecution(BaseModel):
    id: int
    rule_id: int
    rule_code: str
    rule_name: str
    event_type: str
    customer_id: int | None = None
    status: ExecutionStatus
    latency_ms: int | None = None
    created_at: datetime


class RecentEvent(BaseModel):
    id: int
    event_id: str
    type: str
    subject_kind: str | None = None
    subject_id: str | None = None
    occurred_at: datetime


class OverviewResponse(BaseModel):
    counters: CountersOut
    top_rules: list[TopRule]
    recent_executions: list[RecentExecution]
    recent_events: list[RecentEvent]


# ────────────────────────────────────────────────────────────────
# Endpoint
# ────────────────────────────────────────────────────────────────


@router.get("", response_model=OverviewResponse)
async def get_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> OverviewResponse:
    if scope.tenant_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "SUPER_ADMIN debe seleccionar tenant para ver el overview",
        )

    tenant_id = scope.tenant_id
    now = datetime.now(timezone.utc)
    since_7d = now - timedelta(days=7)
    since_24h = now - timedelta(hours=24)

    # ── Counters ─────────────────────────────────────────
    customers_total = (
        await db.execute(
            select(func.count()).select_from(_LegacyCustomer)
            .where(_LegacyCustomer.tenant_id == tenant_id)
        )
    ).scalar_one()

    wallets_total = (
        await db.execute(
            select(func.count()).select_from(Wallet)
            .where(Wallet.tenant_id == tenant_id)
        )
    ).scalar_one()

    rules_total = (
        await db.execute(
            select(func.count()).select_from(Rule)
            .where(Rule.tenant_id == tenant_id)
        )
    ).scalar_one()

    rules_active = (
        await db.execute(
            select(func.count()).select_from(Rule)
            .where(Rule.tenant_id == tenant_id, Rule.enabled.is_(True))
        )
    ).scalar_one()

    events_last_24h = (
        await db.execute(
            select(func.count()).select_from(EventOutbox)
            .where(
                EventOutbox.tenant_id == tenant_id,
                EventOutbox.occurred_at >= since_24h,
            )
        )
    ).scalar_one()

    executions_last_7d = (
        await db.execute(
            select(func.count()).select_from(RuleExecution)
            .where(
                RuleExecution.tenant_id == tenant_id,
                RuleExecution.created_at >= since_7d,
            )
        )
    ).scalar_one()

    executions_fired_last_7d = (
        await db.execute(
            select(func.count()).select_from(RuleExecution)
            .where(
                RuleExecution.tenant_id == tenant_id,
                RuleExecution.created_at >= since_7d,
                RuleExecution.status == ExecutionStatus.FIRED,
            )
        )
    ).scalar_one()

    executions_errored_last_7d = (
        await db.execute(
            select(func.count()).select_from(RuleExecution)
            .where(
                RuleExecution.tenant_id == tenant_id,
                RuleExecution.created_at >= since_7d,
                RuleExecution.status == ExecutionStatus.ERRORED,
            )
        )
    ).scalar_one()

    counters = CountersOut(
        customers_total=int(customers_total),
        wallets_total=int(wallets_total),
        rules_total=int(rules_total),
        rules_active=int(rules_active),
        events_last_24h=int(events_last_24h),
        executions_last_7d=int(executions_last_7d),
        executions_fired_last_7d=int(executions_fired_last_7d),
        executions_errored_last_7d=int(executions_errored_last_7d),
    )

    # ── Top rules por fires en últimos 7d ────────────────
    top_rows = (
        await db.execute(
            select(
                Rule.id, Rule.code, Rule.name,
                func.count(RuleExecution.id).label("fires"),
            )
            .join(RuleExecution, RuleExecution.rule_id == Rule.id)
            .where(
                Rule.tenant_id == tenant_id,
                RuleExecution.status == ExecutionStatus.FIRED,
                RuleExecution.created_at >= since_7d,
                RuleExecution.dry_run.is_(False),
            )
            .group_by(Rule.id, Rule.code, Rule.name)
            .order_by(func.count(RuleExecution.id).desc())
            .limit(5)
        )
    ).all()
    top_rules = [
        TopRule(rule_id=r[0], code=r[1], name=r[2], fires_last_7d=int(r[3]))
        for r in top_rows
    ]

    # ── Recent executions (últimas 15) ───────────────────
    recent_exec_rows = (
        await db.execute(
            select(
                RuleExecution.id, RuleExecution.rule_id, Rule.code, Rule.name,
                RuleExecution.event_type, RuleExecution.customer_id,
                RuleExecution.status, RuleExecution.latency_ms,
                RuleExecution.created_at,
            )
            .join(Rule, Rule.id == RuleExecution.rule_id)
            .where(RuleExecution.tenant_id == tenant_id)
            .order_by(RuleExecution.id.desc())
            .limit(15)
        )
    ).all()
    recent_executions = [
        RecentExecution(
            id=r[0], rule_id=r[1], rule_code=r[2], rule_name=r[3],
            event_type=r[4], customer_id=r[5], status=r[6],
            latency_ms=r[7], created_at=r[8],
        )
        for r in recent_exec_rows
    ]

    # ── Recent events del outbox (últimos 15) ────────────
    recent_event_rows = (
        await db.execute(
            select(EventOutbox)
            .where(EventOutbox.tenant_id == tenant_id)
            .order_by(EventOutbox.id.desc())
            .limit(15)
        )
    ).scalars().all()

    def _subject_of(evt: EventOutbox) -> tuple[str | None, str | None]:
        s = evt.subject or {}
        if not isinstance(s, dict):
            return None, None
        kind = s.get("kind")
        sid = s.get("id")
        return (str(kind) if kind else None, str(sid) if sid is not None else None)

    recent_events = []
    for evt in recent_event_rows:
        kind, sid = _subject_of(evt)
        recent_events.append(
            RecentEvent(
                id=evt.id,
                event_id=evt.event_id,
                type=evt.type,
                subject_kind=kind,
                subject_id=sid,
                occurred_at=evt.occurred_at,
            )
        )

    return OverviewResponse(
        counters=counters,
        top_rules=top_rules,
        recent_executions=recent_executions,
        recent_events=recent_events,
    )
