"""Integration tests del service del Rules Engine.

Cubre:
  - create_rule crea Rule + RuleVersion + emite rules.rule.published.
  - Duplicate code rechazado con DuplicateRuleCodeError.
  - update_rule crea RuleVersion nueva y actualiza active_version_id.
  - set_enabled toggle.
  - list_rules_for_event filtra bien.
  - dry_run evalúa sin efectos.
  - evaluate_rules ejecuta rule con condiciones + acciones + escribe
    RuleExecution + publica rules.rule.fired.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.platform.events import (
    Actor,
    ActorKind,
    Event,
    Subject,
)
from app.modules.platform.events.models import EventOutbox
from app.modules.rules import (
    Action,
    ConditionGroup,
    DryRunRequest,
    DuplicateRuleCodeError,
    ExecutionStatus,
    Limits,
    Predicate,
    RuleCreateRequest,
    RuleDefinition,
    RuleUpdateRequest,
    RuleVersion,
    Trigger,
    UnknownActionError,
    create_rule,
    dry_run,
    evaluate_rules,
    events as rules_events,
    find_by_code,
    list_rules_for_event,
    set_enabled,
    update_rule,
)
from app.modules.rules.models import RuleExecution
from app.modules.wallet import BalanceType, WalletBalance, find, get_balance


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Rules Test Tenant', 'rules-test', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


@pytest_asyncio.fixture
async def customer_id(integration_db, tenant_id) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO customers (
                tenant_id, full_name, email, phone, document, created_at, updated_at
            )
            VALUES (:tid, 'Rules Customer', 'r@r.co', '3001234567', 'RC1', now(), now())
            RETURNING id
            """
        ),
        {"tid": tenant_id},
    )
    cid = int(result.scalar_one())
    await integration_db.commit()
    return cid


def _actor(kind=ActorKind.MEMBER, aid=1) -> Actor:
    return Actor(kind=kind, id=aid)


def _welcome_definition() -> RuleDefinition:
    """Regla: cuando customer.identified con first_time=True → +100 pts."""
    return RuleDefinition(
        name="Bienvenida: 100 pts",
        description="Primer identify → 100 pts",
        trigger=Trigger(event="customer.identified"),
        conditions=ConditionGroup(
            all=[Predicate(path="data.first_time", op="eq", value=True)],
        ),
        actions=[
            Action(
                type="wallet.credit_points",
                params={"amount": 100, "reason": "welcome"},
            ),
        ],
    )


def _purchase_definition() -> RuleDefinition:
    """Regla: sale >50k → floor(monto/1000) puntos + límite diario."""
    return RuleDefinition(
        name="Puntos por compra",
        trigger=Trigger(event="pos.sale.completed"),
        conditions=ConditionGroup(
            all=[Predicate(path="data.amount_cop", op="gte", value=50000)],
        ),
        actions=[
            Action(
                type="wallet.credit_points",
                params={
                    "amount": "expr:floor(data.amount_cop / 1000)",
                    "reason": "compra",
                },
            ),
        ],
        limits=Limits(per_customer_per_day=3),
    )


class TestCreateRule:
    async def test_creates_rule_and_first_version(
        self, integration_db, tenant_id,
    ):
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="welcome", definition=_welcome_definition(),
            ),
        )
        await integration_db.commit()

        assert rule.id > 0
        assert rule.trigger_event_type == "customer.identified"
        assert rule.active_version_id is not None

        version = await integration_db.get(RuleVersion, rule.active_version_id)
        assert version.version == 1
        assert version.dsl["trigger"]["event"] == "customer.identified"

        # Evento rules.rule.published emitido.
        types = list((
            await integration_db.execute(
                select(EventOutbox.type)
                .where(EventOutbox.subject["kind"].astext == "rule")
                .where(EventOutbox.subject["id"].astext == str(rule.id))
            )
        ).scalars().all())
        assert rules_events.RULES_RULE_PUBLISHED in types

    async def test_duplicate_code_rejected(
        self, integration_db, tenant_id,
    ):
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="welcome", definition=_welcome_definition(),
            ),
        )
        await integration_db.commit()

        with pytest.raises(DuplicateRuleCodeError):
            await create_rule(
                integration_db,
                tenant_id=tenant_id,
                actor=_actor(),
                request=RuleCreateRequest(
                    code="welcome", definition=_welcome_definition(),
                ),
            )

    async def test_unknown_action_rejected(
        self, integration_db, tenant_id,
    ):
        bad_def = RuleDefinition(
            name="bad",
            trigger=Trigger(event="customer.identified"),
            actions=[Action(type="never.registered", params={})],
        )
        with pytest.raises(UnknownActionError):
            await create_rule(
                integration_db,
                tenant_id=tenant_id,
                actor=_actor(),
                request=RuleCreateRequest(code="bad", definition=bad_def),
            )


class TestUpdateRule:
    async def test_creates_new_version(self, integration_db, tenant_id):
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="w2", definition=_welcome_definition(),
            ),
        )
        await integration_db.commit()

        old_version_id = rule.active_version_id
        new_def = _welcome_definition()
        new_def.name = "Bienvenida — 200 pts"
        new_def.actions[0].params["amount"] = 200

        rule = await update_rule(
            integration_db,
            rule_id=rule.id,
            actor=_actor(),
            request=RuleUpdateRequest(
                definition=new_def, change_note="ajuste monto",
            ),
        )
        await integration_db.commit()

        assert rule.active_version_id != old_version_id
        new_version = await integration_db.get(RuleVersion, rule.active_version_id)
        assert new_version.version == 2
        assert new_version.change_note == "ajuste monto"


class TestSetEnabled:
    async def test_toggle_publishes_disabled(self, integration_db, tenant_id):
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="t1", definition=_welcome_definition(),
            ),
        )
        await integration_db.commit()

        await set_enabled(
            integration_db, rule_id=rule.id, enabled=False, actor=_actor(),
        )
        await integration_db.commit()
        assert rule.enabled is False

        types = list((
            await integration_db.execute(
                select(EventOutbox.type)
                .where(EventOutbox.subject["kind"].astext == "rule")
                .where(EventOutbox.subject["id"].astext == str(rule.id))
            )
        ).scalars().all())
        assert rules_events.RULES_RULE_DISABLED in types


class TestListRulesForEvent:
    async def test_filters_by_type_and_enabled(self, integration_db, tenant_id):
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="w3", definition=_welcome_definition(),
            ),
        )
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="p3", definition=_purchase_definition(),
            ),
        )
        await integration_db.commit()

        welcome_rules = await list_rules_for_event(
            integration_db,
            tenant_id=tenant_id,
            event_type="customer.identified",
        )
        assert len(welcome_rules) == 1
        assert welcome_rules[0].code == "w3"

        purchase_rules = await list_rules_for_event(
            integration_db,
            tenant_id=tenant_id,
            event_type="pos.sale.completed",
        )
        assert len(purchase_rules) == 1
        assert purchase_rules[0].code == "p3"


class TestDryRun:
    async def test_matched_conditions_and_planned_actions(
        self, integration_db, tenant_id, customer_id,
    ):
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="dry1", definition=_purchase_definition(),
            ),
        )
        await integration_db.commit()

        result = await dry_run(
            integration_db,
            rule_id=rule.id,
            request=DryRunRequest(
                event_type="pos.sale.completed",
                event_data={"amount_cop": 55000},
                customer_id=customer_id,
            ),
        )

        assert result.matched_conditions is True
        assert result.status is ExecutionStatus.FIRED
        assert len(result.actions_planned) == 1
        assert result.actions_planned[0]["type"] == "wallet.credit_points"
        # expr:floor(55000/1000) → 55
        assert result.actions_planned[0]["params"]["amount"] == 55

        # Sin efectos: wallet NO existe.
        assert await find(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        ) is None

    async def test_conditions_not_met(
        self, integration_db, tenant_id, customer_id,
    ):
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="dry2", definition=_purchase_definition(),
            ),
        )
        await integration_db.commit()

        result = await dry_run(
            integration_db,
            rule_id=rule.id,
            request=DryRunRequest(
                event_type="pos.sale.completed",
                event_data={"amount_cop": 100},
                customer_id=customer_id,
            ),
        )
        assert result.matched_conditions is False
        assert result.status is ExecutionStatus.SKIPPED
        assert result.actions_planned == []


class TestEvaluateRules:
    async def test_fires_and_credits_wallet(
        self, integration_db, tenant_id, customer_id,
    ):
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="fire1", definition=_purchase_definition(),
            ),
        )
        await integration_db.commit()

        event = Event(
            type="pos.sale.completed",
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            subject=Subject(kind="customer", id=customer_id),
            data={"amount_cop": 60000, "customer_id": customer_id},
        )
        executions = await evaluate_rules(integration_db, event=event)
        await integration_db.commit()

        assert len(executions) == 1
        assert executions[0].status is ExecutionStatus.FIRED
        # expr:floor(60000/1000) = 60
        assert executions[0].actions_applied[0]["amount"] == "60"

        wallet = await find(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        )
        assert wallet is not None
        from decimal import Decimal
        assert await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.POINTS,
        ) == Decimal(60)

        # Evento rules.rule.fired publicado.
        fired_types = list((
            await integration_db.execute(
                select(EventOutbox.type)
                .where(EventOutbox.type == rules_events.RULES_RULE_FIRED)
            )
        ).scalars().all())
        assert len(fired_types) == 1

    async def test_skips_when_conditions_fail(
        self, integration_db, tenant_id, customer_id,
    ):
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="skip1", definition=_purchase_definition(),
            ),
        )
        await integration_db.commit()

        event = Event(
            type="pos.sale.completed",
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            subject=Subject(kind="customer", id=customer_id),
            data={"amount_cop": 100, "customer_id": customer_id},
        )
        executions = await evaluate_rules(integration_db, event=event)
        await integration_db.commit()

        assert len(executions) == 1
        assert executions[0].status is ExecutionStatus.SKIPPED
        assert executions[0].actions_applied == []

        # Balance no cambió.
        wallet = await find(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        )
        assert wallet is None

    async def test_rate_limit_enforced(
        self, integration_db, tenant_id, customer_id,
    ):
        # Regla con per_customer_per_day=3 — cuarto disparo debe cortar.
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=RuleCreateRequest(
                code="ratelim", definition=_purchase_definition(),
            ),
        )
        await integration_db.commit()

        def _mk_event(idx: int) -> Event:
            return Event(
                type="pos.sale.completed",
                tenant_id=tenant_id,
                actor=Actor(kind=ActorKind.SYSTEM),
                subject=Subject(kind="customer", id=customer_id),
                data={"amount_cop": 60000, "customer_id": customer_id, "n": idx},
            )

        for i in range(3):
            await evaluate_rules(integration_db, event=_mk_event(i))
            await integration_db.commit()

        # cuarto disparo — bloqueado por rate limit.
        executions = await evaluate_rules(integration_db, event=_mk_event(3))
        await integration_db.commit()

        assert executions[0].status is ExecutionStatus.RATE_LIMITED

        # Total de RuleExecution: 3 FIRED + 1 RATE_LIMITED
        all_execs = list((
            await integration_db.execute(select(RuleExecution))
        ).scalars().all())
        fired = sum(1 for e in all_execs if e.status is ExecutionStatus.FIRED)
        limited = sum(1 for e in all_execs if e.status is ExecutionStatus.RATE_LIMITED)
        assert fired == 3
        assert limited == 1

    async def test_ignores_rules_star_events(self, integration_db, tenant_id):
        """Auto-invocación: eventos rules.* NO disparan evaluate_rules."""
        event = Event(
            type="rules.rule.fired",
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            subject=Subject(kind="rule", id=1),
        )
        result = await evaluate_rules(integration_db, event=event)
        assert result == []
