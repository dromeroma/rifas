"""Pydantic response models del módulo analytics."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class TimeWindow(str, enum.Enum):
    """Ventanas soportadas por endpoints con `?window=`."""

    HOUR = "1h"
    DAY = "24h"
    WEEK = "7d"
    MONTH = "30d"


class ActivityItem(BaseModel):
    """Fila del feed de actividad — un evento del outbox."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: str
    type: str
    tenant_id: int | None
    actor_kind: str | None = None
    actor_id: str | None = None
    subject_kind: str | None = None
    subject_id: str | None = None
    occurred_at: datetime
    data: dict[str, Any] = {}
    trigger_event_id: str | None = None


class ActivityResponse(BaseModel):
    items: list[ActivityItem]
    next_before_id: int | None    # keyset cursor para paginar
    limit: int


class TimelineEntry(BaseModel):
    """Fila del timeline unificado del customer.

    `kind` distingue el origen:
      event         — evento del bus con subject.customer o data.customer_id
      rule_exec     — ejecución de una regla que involucró al customer
      notification  — delivery hecho al customer
      wallet_ledger — mutación de balance del customer

    El shape del `payload` varía por kind — el frontend lo interpreta
    según el discriminator.
    """

    kind: str
    when: datetime
    title: str
    subtitle: str | None = None
    payload: dict[str, Any] = {}


class TimelineResponse(BaseModel):
    customer_id: int
    entries: list[TimelineEntry]


class KpisResponse(BaseModel):
    """KPIs enriquecidos para el dashboard."""

    window: TimeWindow

    customers_total: int
    customers_new_in_window: int

    wallets_total: int

    events_in_window: int
    events_by_type: dict[str, int]        # top N tipos con conteo

    executions_in_window: int
    executions_fired: int
    executions_errored: int
    executions_skipped: int

    notifications_sent: int
    notifications_delivered: int
    notifications_failed: int
    notifications_blocked: int

    wallet_points_credited: str           # Decimal → string por precisión
    wallet_points_debited: str


class RuleStat(BaseModel):
    rule_id: int
    code: str
    name: str
    fires: int
    errored: int
    skipped: int
    avg_latency_ms: float | None
    error_rate: float


class RulesLeaderboardResponse(BaseModel):
    window: TimeWindow
    rules: list[RuleStat]


class ChannelStat(BaseModel):
    channel: str
    queued: int
    sent: int
    delivered: int
    failed: int
    blocked: int
    success_rate: float                   # delivered / (sent + delivered + failed)


class ChannelsResponse(BaseModel):
    window: TimeWindow
    channels: list[ChannelStat]


class HistogramBucket(BaseModel):
    bucket_start: datetime
    total: int
    by_type: dict[str, int] = {}         # top tipos dentro del bucket


class HistogramResponse(BaseModel):
    window: TimeWindow
    bucket: str
    buckets: list[HistogramBucket]
