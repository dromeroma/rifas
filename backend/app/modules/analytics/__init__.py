"""Módulo analytics — vistas agregadas del panel Perks.

Cero persistencia propia. Solo consulta sobre lo que ya existe:
event_outbox, rule_executions, notification_deliveries, wallet_ledger,
wallets, customer_identities, customers (legacy).

Todas las queries van filtradas por tenant_id y con ventanas cortas
por defecto para no sobrecargar la BD.

Endpoints:
  GET /api/v1/analytics/activity          feed cronológico del bus
  GET /api/v1/analytics/timeline/{cust}   timeline unificado del customer
  GET /api/v1/analytics/kpis              KPIs enriquecidos con ventana
  GET /api/v1/analytics/rules-leaderboard top rules por fires + error rate
  GET /api/v1/analytics/channels          deliveries por canal + success rate
  GET /api/v1/analytics/events-histogram  histograma temporal para gráficas
"""
from __future__ import annotations

from app.modules.analytics.schemas import (
    ActivityItem,
    ActivityResponse,
    ChannelStat,
    ChannelsResponse,
    HistogramBucket,
    HistogramResponse,
    KpisResponse,
    RulesLeaderboardResponse,
    RuleStat,
    TimelineEntry,
    TimelineResponse,
    TimeWindow,
)
from app.modules.analytics.service import (
    channels_breakdown,
    customer_timeline,
    events_histogram,
    kpis_snapshot,
    recent_activity,
    rules_leaderboard,
)

__all__ = [
    "ActivityItem",
    "ActivityResponse",
    "ChannelStat",
    "ChannelsResponse",
    "HistogramBucket",
    "HistogramResponse",
    "KpisResponse",
    "RuleStat",
    "RulesLeaderboardResponse",
    "TimeWindow",
    "TimelineEntry",
    "TimelineResponse",
    "channels_breakdown",
    "customer_timeline",
    "events_histogram",
    "kpis_snapshot",
    "recent_activity",
    "rules_leaderboard",
]
