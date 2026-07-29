"""Service del módulo analytics — queries agregadas.

Todas las funciones son async y devuelven Pydantic models. Cero
mutación de estado — módulo puramente read-side.

Reglas:
  · Toda query lleva `WHERE tenant_id = :t` — sin excepciones.
  · Ventanas se cortan por `occurred_at >= now - delta` para acotar
    el scan y no depender de índices adicionales.
  · Ranking/agregados devuelven top N (default 10) para evitar
    payloads gigantes.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, case, cast, func, or_, select, text
from sqlalchemy.dialects.postgresql import JSONB

from app.modules.analytics.schemas import (
    ActivityItem,
    ActivityResponse,
    ChannelStat,
    ChannelsResponse,
    HistogramBucket,
    HistogramResponse,
    KpisResponse,
    RuleStat,
    RulesLeaderboardResponse,
    TimelineEntry,
    TimelineResponse,
    TimeWindow,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────


_WINDOW_DELTA: dict[TimeWindow, timedelta] = {
    TimeWindow.HOUR: timedelta(hours=1),
    TimeWindow.DAY: timedelta(hours=24),
    TimeWindow.WEEK: timedelta(days=7),
    TimeWindow.MONTH: timedelta(days=30),
}


def _since(window: TimeWindow) -> datetime:
    return datetime.now(timezone.utc) - _WINDOW_DELTA[window]


def _subject_fields(subject: Any) -> tuple[str | None, str | None]:
    if not isinstance(subject, dict):
        return None, None
    kind = subject.get("kind")
    sid = subject.get("id")
    return (str(kind) if kind else None), (str(sid) if sid is not None else None)


def _actor_fields(actor: Any) -> tuple[str | None, str | None]:
    if not isinstance(actor, dict):
        return None, None
    kind = actor.get("kind")
    aid = actor.get("id")
    return (str(kind) if kind else None), (str(aid) if aid is not None else None)


def _context_trigger(context: Any) -> str | None:
    if not isinstance(context, dict):
        return None
    trig = context.get("trigger_event_id")
    return str(trig) if trig else None


# ────────────────────────────────────────────────────────────────
# 1. recent_activity — feed cronológico del bus (keyset paginado)
# ────────────────────────────────────────────────────────────────


async def recent_activity(
    db: "AsyncSession",
    *,
    tenant_id: int,
    limit: int = 50,
    before_id: int | None = None,
    type_prefix: str | None = None,
    subject_kind: str | None = None,
) -> ActivityResponse:
    """Feed del outbox. Paginación keyset por id descendente.

    `type_prefix` — filtra por prefijo (ej. "rules." trae todos los
    eventos del módulo rules). Es más útil que exact-match para el UI.
    """
    from app.modules.platform.events.models import EventOutbox

    stmt = select(EventOutbox).where(EventOutbox.tenant_id == tenant_id)
    if before_id is not None:
        stmt = stmt.where(EventOutbox.id < before_id)
    if type_prefix:
        stmt = stmt.where(EventOutbox.type.like(f"{type_prefix}%"))
    if subject_kind:
        # subject es JSONB — usamos ->> para comparar como texto.
        stmt = stmt.where(
            text("subject->>'kind' = :sk").bindparams(sk=subject_kind)
        )
    stmt = stmt.order_by(EventOutbox.id.desc()).limit(limit + 1)

    rows = list((await db.execute(stmt)).scalars().all())

    has_more = len(rows) > limit
    rows = rows[:limit]

    items: list[ActivityItem] = []
    for evt in rows:
        subject_kind_v, subject_id_v = _subject_fields(evt.subject)
        actor_kind_v, actor_id_v = _actor_fields(evt.actor)
        items.append(
            ActivityItem(
                id=evt.id,
                event_id=evt.event_id,
                type=evt.type,
                tenant_id=evt.tenant_id,
                actor_kind=actor_kind_v,
                actor_id=actor_id_v,
                subject_kind=subject_kind_v,
                subject_id=subject_id_v,
                occurred_at=evt.occurred_at,
                data=evt.data or {},
                trigger_event_id=_context_trigger(evt.context),
            )
        )

    next_cursor = rows[-1].id if has_more and rows else None
    return ActivityResponse(items=items, next_before_id=next_cursor, limit=limit)


# ────────────────────────────────────────────────────────────────
# 2. customer_timeline — vista unificada de todo lo que le pasó al customer
# ────────────────────────────────────────────────────────────────


async def customer_timeline(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    limit: int = 100,
) -> TimelineResponse:
    """Compone timeline desde 4 fuentes y ordena por fecha DESC."""
    from app.modules.notifications.models import NotificationDelivery
    from app.modules.platform.events.models import EventOutbox
    from app.modules.rules.models import Rule, RuleExecution
    from app.modules.wallet.models import Wallet, WalletLedger

    entries: list[TimelineEntry] = []

    # ── Eventos del bus donde el customer es subject
    # o donde data.customer_id == customer_id
    subject_matches = text("subject->>'kind' = 'customer' AND subject->>'id' = :cid")
    data_matches = text("(data->>'customer_id')::text = :cid")
    ev_rows = list(
        (
            await db.execute(
                select(EventOutbox)
                .where(
                    EventOutbox.tenant_id == tenant_id,
                    or_(subject_matches, data_matches),
                )
                .order_by(EventOutbox.id.desc())
                .limit(limit)
                .params(cid=str(customer_id))
            )
        )
        .scalars()
        .all()
    )
    for evt in ev_rows:
        entries.append(
            TimelineEntry(
                kind="event",
                when=evt.occurred_at,
                title=evt.type,
                subtitle=(evt.actor or {}).get("kind") if isinstance(evt.actor, dict) else None,
                payload={
                    "event_id": evt.event_id,
                    "type": evt.type,
                    "data": evt.data or {},
                    "trigger_event_id": _context_trigger(evt.context),
                },
            )
        )

    # ── Rule executions del customer
    exec_rows = list(
        (
            await db.execute(
                select(
                    RuleExecution.id,
                    RuleExecution.event_type,
                    RuleExecution.status,
                    RuleExecution.actions_applied,
                    RuleExecution.latency_ms,
                    RuleExecution.created_at,
                    RuleExecution.error,
                    Rule.code,
                    Rule.name,
                )
                .join(Rule, Rule.id == RuleExecution.rule_id)
                .where(
                    RuleExecution.tenant_id == tenant_id,
                    RuleExecution.customer_id == customer_id,
                    RuleExecution.dry_run.is_(False),
                )
                .order_by(RuleExecution.id.desc())
                .limit(limit)
            )
        ).all()
    )
    for r in exec_rows:
        entries.append(
            TimelineEntry(
                kind="rule_exec",
                when=r[5],
                title=f"regla {r[7]} — {r[2].value}",
                subtitle=r[8],
                payload={
                    "execution_id": r[0],
                    "event_type": r[1],
                    "status": r[2].value,
                    "actions_applied": r[3] or [],
                    "latency_ms": r[4],
                    "error": r[6],
                },
            )
        )

    # ── Notification deliveries al customer
    notif_rows = list(
        (
            await db.execute(
                select(NotificationDelivery)
                .where(
                    NotificationDelivery.tenant_id == tenant_id,
                    NotificationDelivery.customer_id == customer_id,
                )
                .order_by(NotificationDelivery.id.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for d in notif_rows:
        entries.append(
            TimelineEntry(
                kind="notification",
                when=d.created_at,
                title=f"mensaje {d.channel.value} — {d.status.value}",
                subtitle=d.template_key,
                payload={
                    "delivery_id": d.id,
                    "template_key": d.template_key,
                    "channel": d.channel.value,
                    "status": d.status.value,
                    "subject": d.rendered_subject,
                    "body": d.rendered_body,
                    "destination": d.destination,
                    "sent_at": d.sent_at.isoformat() if d.sent_at else None,
                    "delivered_at": d.delivered_at.isoformat() if d.delivered_at else None,
                },
            )
        )

    # ── Wallet ledger (buscar wallet del customer y traer sus filas)
    wallet_row = (
        await db.execute(
            select(Wallet.id).where(
                Wallet.tenant_id == tenant_id,
                Wallet.customer_id == customer_id,
            )
        )
    ).scalar_one_or_none()
    if wallet_row is not None:
        ledger_rows = list(
            (
                await db.execute(
                    select(WalletLedger)
                    .where(WalletLedger.wallet_id == wallet_row)
                    .order_by(WalletLedger.id.desc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        for lg in ledger_rows:
            sign = "+" if lg.delta >= 0 else ""
            entries.append(
                TimelineEntry(
                    kind="wallet_ledger",
                    when=lg.created_at,
                    title=f"{lg.balance_type.value} {sign}{lg.delta}",
                    subtitle=lg.cause.value,
                    payload={
                        "ledger_id": lg.id,
                        "balance_type": lg.balance_type.value,
                        "delta": str(lg.delta),
                        "balance_after": str(lg.balance_after),
                        "cause": lg.cause.value,
                        "cause_ref": lg.cause_ref,
                        "memo": lg.memo,
                        "related_event_id": lg.related_event_id,
                    },
                )
            )

    entries.sort(key=lambda e: e.when, reverse=True)
    entries = entries[:limit]

    return TimelineResponse(customer_id=customer_id, entries=entries)


# ────────────────────────────────────────────────────────────────
# 3. kpis_snapshot — KPIs enriquecidos con ventana temporal
# ────────────────────────────────────────────────────────────────


_TOP_EVENT_TYPES_LIMIT = 8


async def kpis_snapshot(
    db: "AsyncSession",
    *,
    tenant_id: int,
    window: TimeWindow = TimeWindow.DAY,
) -> KpisResponse:
    """Snapshot enriquecido. Cada bloque es una query separada — no
    combinamos para mantener planes simples y evitar joins caros."""
    from app.models.customer import Customer as _LegacyCustomer
    from app.modules.notifications.models import (
        DeliveryStatus,
        NotificationDelivery,
    )
    from app.modules.platform.events.models import EventOutbox
    from app.modules.rules.models import ExecutionStatus, RuleExecution
    from app.modules.wallet.models import BalanceType, Wallet, WalletLedger

    since = _since(window)

    # ── Customers
    customers_total = int(
        (
            await db.execute(
                select(func.count()).select_from(_LegacyCustomer)
                .where(_LegacyCustomer.tenant_id == tenant_id)
            )
        ).scalar_one()
    )
    customers_new = int(
        (
            await db.execute(
                select(func.count()).select_from(_LegacyCustomer)
                .where(
                    _LegacyCustomer.tenant_id == tenant_id,
                    _LegacyCustomer.created_at >= since,
                )
            )
        ).scalar_one()
    )

    wallets_total = int(
        (
            await db.execute(
                select(func.count()).select_from(Wallet)
                .where(Wallet.tenant_id == tenant_id)
            )
        ).scalar_one()
    )

    # ── Events
    events_in_window = int(
        (
            await db.execute(
                select(func.count()).select_from(EventOutbox)
                .where(
                    EventOutbox.tenant_id == tenant_id,
                    EventOutbox.occurred_at >= since,
                )
            )
        ).scalar_one()
    )
    top_events = list(
        (
            await db.execute(
                select(EventOutbox.type, func.count(EventOutbox.id))
                .where(
                    EventOutbox.tenant_id == tenant_id,
                    EventOutbox.occurred_at >= since,
                )
                .group_by(EventOutbox.type)
                .order_by(func.count(EventOutbox.id).desc())
                .limit(_TOP_EVENT_TYPES_LIMIT)
            )
        ).all()
    )
    events_by_type = {t: int(c) for t, c in top_events}

    # ── Executions
    exec_rows = list(
        (
            await db.execute(
                select(RuleExecution.status, func.count(RuleExecution.id))
                .where(
                    RuleExecution.tenant_id == tenant_id,
                    RuleExecution.created_at >= since,
                    RuleExecution.dry_run.is_(False),
                )
                .group_by(RuleExecution.status)
            )
        ).all()
    )
    exec_by_status = {status.value: int(count) for status, count in exec_rows}
    executions_in_window = sum(exec_by_status.values())

    # ── Notifications
    notif_rows = list(
        (
            await db.execute(
                select(NotificationDelivery.status, func.count(NotificationDelivery.id))
                .where(
                    NotificationDelivery.tenant_id == tenant_id,
                    NotificationDelivery.created_at >= since,
                )
                .group_by(NotificationDelivery.status)
            )
        ).all()
    )
    notif_by_status = {status.value: int(count) for status, count in notif_rows}

    # ── Wallet ledger — puntos issued/redeemed en la ventana
    credited = (
        (
            await db.execute(
                select(func.coalesce(func.sum(WalletLedger.delta), 0))
                .where(
                    WalletLedger.tenant_id == tenant_id,
                    WalletLedger.balance_type == BalanceType.POINTS,
                    WalletLedger.delta > 0,
                    WalletLedger.created_at >= since,
                )
            )
        ).scalar_one()
    ) or Decimal(0)
    debited_raw = (
        (
            await db.execute(
                select(func.coalesce(func.sum(WalletLedger.delta), 0))
                .where(
                    WalletLedger.tenant_id == tenant_id,
                    WalletLedger.balance_type == BalanceType.POINTS,
                    WalletLedger.delta < 0,
                    WalletLedger.created_at >= since,
                )
            )
        ).scalar_one()
    ) or Decimal(0)

    return KpisResponse(
        window=window,
        customers_total=customers_total,
        customers_new_in_window=customers_new,
        wallets_total=wallets_total,
        events_in_window=events_in_window,
        events_by_type=events_by_type,
        executions_in_window=executions_in_window,
        executions_fired=exec_by_status.get("fired", 0),
        executions_errored=exec_by_status.get("errored", 0),
        executions_skipped=exec_by_status.get("skipped", 0),
        notifications_sent=notif_by_status.get("sent", 0),
        notifications_delivered=notif_by_status.get("delivered", 0),
        notifications_failed=notif_by_status.get("failed", 0),
        notifications_blocked=notif_by_status.get("blocked", 0),
        wallet_points_credited=str(credited),
        wallet_points_debited=str(abs(debited_raw)),
    )


# ────────────────────────────────────────────────────────────────
# 4. rules_leaderboard — top rules por fires + error rate + latencia
# ────────────────────────────────────────────────────────────────


async def rules_leaderboard(
    db: "AsyncSession",
    *,
    tenant_id: int,
    window: TimeWindow = TimeWindow.WEEK,
    limit: int = 10,
) -> RulesLeaderboardResponse:
    from app.modules.rules.models import ExecutionStatus, Rule, RuleExecution

    since = _since(window)

    fired_case = case(
        (RuleExecution.status == ExecutionStatus.FIRED, 1), else_=0,
    )
    errored_case = case(
        (RuleExecution.status == ExecutionStatus.ERRORED, 1), else_=0,
    )
    skipped_case = case(
        (RuleExecution.status == ExecutionStatus.SKIPPED, 1), else_=0,
    )

    rows = list(
        (
            await db.execute(
                select(
                    Rule.id, Rule.code, Rule.name,
                    func.sum(fired_case).label("fires"),
                    func.sum(errored_case).label("errored"),
                    func.sum(skipped_case).label("skipped"),
                    func.avg(RuleExecution.latency_ms).label("avg_lat"),
                    func.count(RuleExecution.id).label("total"),
                )
                .join(RuleExecution, RuleExecution.rule_id == Rule.id)
                .where(
                    Rule.tenant_id == tenant_id,
                    RuleExecution.created_at >= since,
                    RuleExecution.dry_run.is_(False),
                )
                .group_by(Rule.id, Rule.code, Rule.name)
                .order_by(func.sum(fired_case).desc())
                .limit(limit)
            )
        ).all()
    )

    stats: list[RuleStat] = []
    for r in rows:
        total = int(r[7])
        errored = int(r[4] or 0)
        stats.append(
            RuleStat(
                rule_id=r[0],
                code=r[1],
                name=r[2],
                fires=int(r[3] or 0),
                errored=errored,
                skipped=int(r[5] or 0),
                avg_latency_ms=float(r[6]) if r[6] is not None else None,
                error_rate=(errored / total) if total else 0.0,
            )
        )
    return RulesLeaderboardResponse(window=window, rules=stats)


# ────────────────────────────────────────────────────────────────
# 5. channels_breakdown — deliveries por canal + success rate
# ────────────────────────────────────────────────────────────────


async def channels_breakdown(
    db: "AsyncSession",
    *,
    tenant_id: int,
    window: TimeWindow = TimeWindow.WEEK,
) -> ChannelsResponse:
    from app.modules.notifications.models import (
        DeliveryStatus,
        NotificationDelivery,
    )

    since = _since(window)

    rows = list(
        (
            await db.execute(
                select(
                    NotificationDelivery.channel,
                    NotificationDelivery.status,
                    func.count(NotificationDelivery.id),
                )
                .where(
                    NotificationDelivery.tenant_id == tenant_id,
                    NotificationDelivery.created_at >= since,
                )
                .group_by(NotificationDelivery.channel, NotificationDelivery.status)
            )
        ).all()
    )

    grid: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for channel, status_, count in rows:
        grid[channel.value][status_.value] += int(count)

    stats: list[ChannelStat] = []
    for channel, by_status in sorted(grid.items()):
        queued = by_status.get("queued", 0)
        sent = by_status.get("sent", 0)
        delivered = by_status.get("delivered", 0)
        failed = by_status.get("failed", 0)
        blocked = by_status.get("blocked", 0)
        attempted = sent + delivered + failed
        success = (delivered / attempted) if attempted else 0.0
        stats.append(
            ChannelStat(
                channel=channel,
                queued=queued,
                sent=sent,
                delivered=delivered,
                failed=failed,
                blocked=blocked,
                success_rate=success,
            )
        )
    return ChannelsResponse(window=window, channels=stats)


# ────────────────────────────────────────────────────────────────
# 6. events_histogram — buckets temporales para gráficas
# ────────────────────────────────────────────────────────────────


_BUCKET_TO_SQL: dict[str, str] = {
    "hour": "hour",
    "day": "day",
}


async def events_histogram(
    db: "AsyncSession",
    *,
    tenant_id: int,
    window: TimeWindow = TimeWindow.DAY,
    bucket: str = "hour",
) -> HistogramResponse:
    """Cuenta eventos agrupados por bucket usando `date_trunc` de Postgres."""
    from app.modules.platform.events.models import EventOutbox

    trunc_unit = _BUCKET_TO_SQL.get(bucket, "hour")
    since = _since(window)

    bucket_col = func.date_trunc(trunc_unit, EventOutbox.occurred_at).label("b")

    rows = list(
        (
            await db.execute(
                select(bucket_col, func.count(EventOutbox.id))
                .where(
                    EventOutbox.tenant_id == tenant_id,
                    EventOutbox.occurred_at >= since,
                )
                .group_by(bucket_col)
                .order_by(bucket_col.asc())
            )
        ).all()
    )

    # Top types por bucket — segunda query separada para no explotar el grouping
    type_rows = list(
        (
            await db.execute(
                select(bucket_col, EventOutbox.type, func.count(EventOutbox.id))
                .where(
                    EventOutbox.tenant_id == tenant_id,
                    EventOutbox.occurred_at >= since,
                )
                .group_by(bucket_col, EventOutbox.type)
                .order_by(bucket_col.asc(), func.count(EventOutbox.id).desc())
            )
        ).all()
    )
    by_bucket_types: dict[datetime, dict[str, int]] = defaultdict(dict)
    for b, t, c in type_rows:
        if len(by_bucket_types[b]) < 5:
            by_bucket_types[b][t] = int(c)

    buckets_out = [
        HistogramBucket(
            bucket_start=b, total=int(c), by_type=by_bucket_types.get(b, {}),
        )
        for b, c in rows
    ]

    return HistogramResponse(window=window, bucket=bucket, buckets=buckets_out)


__all__ = [
    "channels_breakdown",
    "customer_timeline",
    "events_histogram",
    "kpis_snapshot",
    "recent_activity",
    "rules_leaderboard",
]
