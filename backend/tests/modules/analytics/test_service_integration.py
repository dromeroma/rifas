"""Integration tests del service analytics.

Cubre los 6 endpoints con datos sembrados directamente en las tablas
que analytics consulta. Cada test es hermético — crea su propio tenant
+ customer + eventos y verifica agregados/filtrados.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import text

from app.modules.analytics import (
    TimeWindow,
    channels_breakdown,
    customer_timeline,
    events_histogram,
    kpis_snapshot,
    recent_activity,
    rules_leaderboard,
)
from app.modules.customer import (
    IdentifyRequest,
    IdentityIn,
    IdentityKind,
    identify,
)
from app.modules.notifications import (
    NotificationChannel,
    SendRequest,
    TemplateIn,
    send as notifications_send,
    upsert_template,
)
from app.modules.platform.events import Actor, ActorKind, Event, Subject, publish
from app.modules.rules import (
    Action,
    ConditionGroup,
    Predicate,
    RuleCreateRequest,
    RuleDefinition,
    Trigger,
    create_rule,
)
from app.modules.wallet import (
    CreditRequest,
    credit,
    find_or_create as wallet_find_or_create,
)
from app.modules.wallet.models import BalanceType, LedgerCause


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Analytics Test', 'analytics-test', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


def _actor() -> Actor:
    return Actor(kind=ActorKind.MEMBER, id=1)


async def _publish_evt(db, tenant_id: int, event_type: str, **extra):
    subject = extra.pop("subject", Subject(kind="test", id=1))
    data = extra.pop("data", {})
    await publish(
        Event(
            type=event_type,
            tenant_id=tenant_id,
            actor=_actor(),
            subject=subject,
            data=data,
        ),
        db,
    )


class TestActivityFeed:
    async def test_returns_paginated_desc(self, integration_db, tenant_id):
        for i in range(3):
            await _publish_evt(
                integration_db, tenant_id, "pos.sale.completed",
                data={"i": i},
            )
        await integration_db.commit()

        page = await recent_activity(integration_db, tenant_id=tenant_id, limit=2)
        assert len(page.items) == 2
        assert page.next_before_id is not None
        # DESC by id
        assert page.items[0].id > page.items[1].id

        page2 = await recent_activity(
            integration_db, tenant_id=tenant_id, limit=2,
            before_id=page.next_before_id,
        )
        assert len(page2.items) == 1
        assert page2.items[0].id < page.items[-1].id
        assert page2.next_before_id is None

    async def test_type_prefix_filters(self, integration_db, tenant_id):
        await _publish_evt(integration_db, tenant_id, "pos.sale.completed")
        await _publish_evt(integration_db, tenant_id, "customer.identified")
        await _publish_evt(integration_db, tenant_id, "rules.rule.fired")
        await integration_db.commit()

        page = await recent_activity(
            integration_db, tenant_id=tenant_id, type_prefix="rules.",
        )
        assert all(item.type.startswith("rules.") for item in page.items)


class TestCustomerTimeline:
    async def test_composes_from_all_sources(self, integration_db, tenant_id):
        # 1. identify -> event customer.identified
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(
                    kind=IdentityKind.EMAIL, value="t@line.co",
                ),
                full_name="Time Line",
            ),
        )
        # 2. wallet + credit
        wallet = await wallet_find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=result.customer_id,
            actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(
                balance_type=BalanceType.POINTS,
                amount=Decimal("50"),
                cause=LedgerCause.MANUAL_ADJUST,
            ),
        )
        # 3. notification
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=TemplateIn(
                key="hi",
                channel=NotificationChannel.IN_APP,
                name="Hi",
                body_text="hi",
                purpose="transactional",
            ),
        )
        await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            req=SendRequest(
                template_key="hi",
                channel=NotificationChannel.IN_APP,
                customer_id=result.customer_id,
            ),
        )
        await integration_db.commit()

        tl = await customer_timeline(
            integration_db,
            tenant_id=tenant_id, customer_id=result.customer_id,
        )

        kinds = {e.kind for e in tl.entries}
        assert "event" in kinds
        assert "notification" in kinds
        assert "wallet_ledger" in kinds


class TestKpisSnapshot:
    async def test_counts_within_window(self, integration_db, tenant_id):
        await _publish_evt(integration_db, tenant_id, "pos.sale.completed")
        await _publish_evt(integration_db, tenant_id, "customer.identified")
        await integration_db.commit()

        kpis = await kpis_snapshot(
            integration_db, tenant_id=tenant_id, window=TimeWindow.DAY,
        )
        assert kpis.events_in_window >= 2
        assert set(kpis.events_by_type.keys()) >= {
            "pos.sale.completed", "customer.identified",
        }
        assert kpis.wallet_points_credited == "0"
        assert kpis.wallet_points_debited == "0"

    async def test_notifications_and_wallet_included(
        self, integration_db, tenant_id,
    ):
        r = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="k@k.co"),
                full_name="K",
            ),
        )
        wallet = await wallet_find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=r.customer_id, actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(
                balance_type=BalanceType.POINTS,
                amount=Decimal("120"),
                cause=LedgerCause.MANUAL_ADJUST,
            ),
        )

        await upsert_template(
            integration_db,
            tenant_id=tenant_id, actor=_actor(),
            payload=TemplateIn(
                key="k", channel=NotificationChannel.IN_APP,
                name="k", body_text="x", purpose="transactional",
            ),
        )
        await notifications_send(
            integration_db,
            tenant_id=tenant_id, actor=_actor(),
            req=SendRequest(
                template_key="k",
                channel=NotificationChannel.IN_APP,
                customer_id=r.customer_id,
            ),
        )
        await integration_db.commit()

        kpis = await kpis_snapshot(
            integration_db, tenant_id=tenant_id, window=TimeWindow.DAY,
        )
        assert kpis.notifications_delivered >= 1
        assert Decimal(kpis.wallet_points_credited) == Decimal("120")


class TestRulesLeaderboard:
    async def test_ranks_by_fires(self, integration_db, tenant_id):
        # 2 reglas, cada una crea automáticamente 1 execution? No —
        # create_rule NO ejecuta. Simulamos executions vía inserts
        # directos por simplicidad.
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id, actor=_actor(),
            request=RuleCreateRequest(
                code="rr",
                definition=RuleDefinition(
                    name="Regla RR",
                    trigger=Trigger(event="pos.sale.completed"),
                    conditions=ConditionGroup(all=[]),
                    actions=[],
                ),
            ),
        )
        await integration_db.commit()

        for _ in range(3):
            await integration_db.execute(
                text(
                    """
                    INSERT INTO rule_executions
                      (tenant_id, rule_id, rule_version_id, event_id,
                       event_type, status, actions_applied, latency_ms,
                       dry_run, created_at)
                    VALUES
                      (:t, :r, :v, :eid, 'pos.sale.completed', 'fired',
                       '[]'::jsonb, 10, false, now())
                    """
                ),
                {
                    "t": tenant_id, "r": rule.id,
                    "v": rule.active_version_id,
                    "eid": f"evt_test{_}",
                },
            )
        await integration_db.commit()

        lb = await rules_leaderboard(
            integration_db, tenant_id=tenant_id, window=TimeWindow.DAY,
        )
        assert len(lb.rules) == 1
        assert lb.rules[0].fires == 3
        assert lb.rules[0].error_rate == 0.0


class TestChannelsBreakdown:
    async def test_computes_success_rate(self, integration_db, tenant_id):
        r = await identify(
            integration_db,
            tenant_id=tenant_id, actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="c@c.co"),
                full_name="C",
            ),
        )
        await upsert_template(
            integration_db,
            tenant_id=tenant_id, actor=_actor(),
            payload=TemplateIn(
                key="c", channel=NotificationChannel.IN_APP,
                name="c", body_text="x", purpose="transactional",
            ),
        )
        for _ in range(3):
            await notifications_send(
                integration_db,
                tenant_id=tenant_id, actor=_actor(),
                req=SendRequest(
                    template_key="c",
                    channel=NotificationChannel.IN_APP,
                    customer_id=r.customer_id,
                    idempotency_key=f"n-{_}",
                ),
            )
        await integration_db.commit()

        stats = await channels_breakdown(
            integration_db, tenant_id=tenant_id, window=TimeWindow.DAY,
        )
        in_app = [s for s in stats.channels if s.channel == "in_app"]
        assert len(in_app) == 1
        assert in_app[0].delivered == 3
        assert in_app[0].success_rate == 1.0


class TestEventsHistogram:
    async def test_buckets_by_hour(self, integration_db, tenant_id):
        for i in range(4):
            await _publish_evt(integration_db, tenant_id, "pos.sale.completed")
        await integration_db.commit()

        hist = await events_histogram(
            integration_db, tenant_id=tenant_id,
            window=TimeWindow.DAY, bucket="hour",
        )
        total = sum(b.total for b in hist.buckets)
        assert total >= 4
        # Al menos un bucket tiene "pos.sale.completed" en su top.
        assert any(
            "pos.sale.completed" in b.by_type for b in hist.buckets
        )
