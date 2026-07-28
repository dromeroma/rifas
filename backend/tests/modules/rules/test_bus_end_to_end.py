"""End-to-end del Rules Engine sobre el event bus.

Escenario canónico:

  1. Se crea una regla "bienvenida: 100 pts al primer identify".
  2. customer.identify() publica customer.identified al outbox.
  3. dispatcher.tick() invoca DOS handlers en orden:
       - wallet.create_on_customer_identified (específico)
       - rules.evaluate_on_any_event (wildcard)
  4. Assertions:
       - Wallet existe con 100 puntos (crédito por la regla).
       - customer.identified quedó DISPATCHED.
       - Ambos handlers registrados en event_handled con SUCCESS.
       - rules.rule.fired quedó en el outbox con trigger_event_id.
       - RuleExecution registrado con status=FIRED.

Requiere DATABASE_URL_TEST.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.customer import (
    IdentifyRequest,
    IdentityIn,
    IdentityKind,
    identify,
)
from app.modules.customer import events as customer_events
from app.modules.platform.events import (
    WILDCARD_EVENT_TYPE,
    Actor,
    ActorKind,
)
from app.modules.platform.events.bus import registry
from app.modules.platform.events.dispatcher import Dispatcher, DispatcherConfig
from app.modules.platform.events.models import (
    EventHandled,
    EventOutbox,
    HandledStatus,
    OutboxStatus,
)
from app.modules.rules import (
    Action,
    ConditionGroup,
    ExecutionStatus,
    Predicate,
    RuleCreateRequest,
    RuleDefinition,
    Trigger,
    create_rule,
    events as rules_events,
)
from app.modules.rules.handlers import evaluate_rules_on_any_event
from app.modules.rules.models import RuleExecution
from app.modules.wallet import BalanceType, find, get_balance
from app.modules.wallet.handlers import create_wallet_on_customer_identified


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _wire_handlers():
    """Registra los handlers necesarios para el flujo end-to-end.

    Estado limpio + re-registro explícito. Es robusto ante otros
    tests que limpien el registry global.
    """
    registry.clear()
    # Handler específico del wallet
    registry.on(
        customer_events.CUSTOMER_IDENTIFIED,
        handler_id="wallet.create_on_customer_identified",
    )(create_wallet_on_customer_identified)
    # Handler wildcard del rules engine
    registry.on(
        WILDCARD_EVENT_TYPE,
        handler_id="rules.evaluate_on_any_event",
    )(evaluate_rules_on_any_event)
    yield
    registry.clear()


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('E2E Rules Tenant', 'e2e-rules', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


def _welcome_rule_definition() -> RuleDefinition:
    return RuleDefinition(
        name="Bienvenida: 100 puntos",
        description="Cuando un customer se identifica por primera vez",
        trigger=Trigger(event="customer.identified"),
        conditions=ConditionGroup(
            all=[Predicate(path="data.first_time", op="eq", value=True)],
        ),
        actions=[
            Action(
                type="wallet.credit_points",
                params={"amount": 100, "reason": "welcome_bonus"},
            ),
        ],
    )


def _fast_config() -> DispatcherConfig:
    return DispatcherConfig(
        poll_interval=0.01, batch_size=10, max_handler_attempts=3,
    )


class TestEndToEnd:
    async def test_full_flow_welcome_bonus(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        # Paso 1: crear la regla de bienvenida
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.MEMBER, id=1),
            request=RuleCreateRequest(
                code="welcome_bonus",
                definition=_welcome_rule_definition(),
            ),
        )
        await integration_db.commit()

        # Paso 2: identify → publica customer.identified
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            request=IdentifyRequest(
                identity=IdentityIn(
                    kind=IdentityKind.EMAIL, value="e2e@rules.co",
                ),
                full_name="E2E Rules Customer",
                source="e2e_test",
            ),
        )
        await integration_db.commit()
        customer_id = result.customer_id

        # Confirmamos que sí quedó el evento pendiente y NO hay wallet aún.
        pending = (
            await integration_db.execute(
                select(EventOutbox).where(
                    EventOutbox.type == customer_events.CUSTOMER_IDENTIFIED,
                    EventOutbox.subject["id"].astext == str(customer_id),
                )
            )
        ).scalar_one()
        assert pending.status == OutboxStatus.PENDING
        assert await find(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        ) is None

        # Paso 3: correr dispatcher — despacha ambos handlers.
        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        await dispatcher.tick()

        # Puede haber más eventos generados (wallet.created, rules.rule.fired,
        # wallet.points.credited) — se procesan también en ticks siguientes.
        await dispatcher.tick()
        await dispatcher.tick()

        # Paso 4: assertions
        # 4a. Wallet existe.
        wallet = await find(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        )
        assert wallet is not None, "wallet debía crearse por el handler específico"

        # 4b. Balance = 100 pts (crédito por la regla)
        balance = await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.POINTS,
        )
        assert balance == Decimal(100), (
            f"balance debía ser 100 pts, es {balance}"
        )

        # 4c. Original customer.identified quedó dispatched.
        await integration_db.refresh(pending)
        assert pending.status == OutboxStatus.DISPATCHED

        # 4d. Ambos handlers registrados con SUCCESS.
        handled = list((
            await integration_db.execute(
                select(EventHandled).where(
                    EventHandled.event_id == pending.event_id,
                )
            )
        ).scalars().all())
        handler_ids = {h.handler_id: h.status for h in handled}
        assert handler_ids.get("wallet.create_on_customer_identified") == HandledStatus.SUCCESS
        assert handler_ids.get("rules.evaluate_on_any_event") == HandledStatus.SUCCESS

        # 4e. rules.rule.fired publicado con trigger correcto.
        fired = list((
            await integration_db.execute(
                select(EventOutbox).where(
                    EventOutbox.type == rules_events.RULES_RULE_FIRED,
                    EventOutbox.subject["id"].astext == str(rule.id),
                )
            )
        ).scalars().all())
        assert len(fired) == 1
        assert fired[0].context.get("trigger_event_id") == pending.event_id
        assert fired[0].data.get("code") == "welcome_bonus"

        # 4f. RuleExecution con status FIRED y acción aplicada.
        execs = list((
            await integration_db.execute(
                select(RuleExecution).where(
                    RuleExecution.rule_id == rule.id,
                )
            )
        ).scalars().all())
        assert len(execs) == 1
        assert execs[0].status is ExecutionStatus.FIRED
        assert execs[0].customer_id == customer_id
        assert execs[0].event_id == pending.event_id
        assert execs[0].actions_applied[0]["action"] == "wallet.credit_points"

    async def test_rule_skipped_when_conditions_fail(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        """Segundo identify sobre el mismo email → first_time=False → skip."""
        rule = await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.MEMBER, id=1),
            request=RuleCreateRequest(
                code="wb2",
                definition=_welcome_rule_definition(),
            ),
        )
        await integration_db.commit()

        # Primer identify → first_time=True → regla dispara.
        result_a = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            request=IdentifyRequest(
                identity=IdentityIn(
                    kind=IdentityKind.EMAIL, value="repeat@rules.co",
                ),
            ),
        )
        await integration_db.commit()

        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        await dispatcher.tick()
        await dispatcher.tick()

        # Segundo identify sobre mismo email → first_time=False, sin evento
        # customer.identified emitido (identify no re-emite para
        # customers ya conocidos).
        result_b = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            request=IdentifyRequest(
                identity=IdentityIn(
                    kind=IdentityKind.EMAIL, value="REPEAT@rules.co",
                ),
            ),
        )
        await integration_db.commit()

        assert result_a.customer_id == result_b.customer_id
        assert result_a.first_time is True
        assert result_b.first_time is False

        # Solo hubo 1 fire (del primer identify).
        execs = list((
            await integration_db.execute(
                select(RuleExecution).where(
                    RuleExecution.rule_id == rule.id,
                    RuleExecution.status == ExecutionStatus.FIRED,
                )
            )
        ).scalars().all())
        assert len(execs) == 1
