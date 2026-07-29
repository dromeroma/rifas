"""End-to-end: regla dispara notifications.send.

Escenario canónico del Sprint 7:
  1. Se crea un template in_app "welcome_in_app".
  2. Se crea una regla que reacciona a customer.identified con action
     notifications.send (channel=in_app, template=welcome_in_app).
  3. Se identify un customer → customer.identified al outbox.
  4. dispatcher.tick() invoca los handlers (wallet crea wallet +
     rules evalúa regla → notifications.send crea delivery).
  5. Assertions:
     · Delivery existe en status DELIVERED.
     · Rendered body contiene el nombre del customer.
     · Cadena causal: customer.identified → rules.rule.fired →
       notifications.message.queued/sent.
"""
from __future__ import annotations

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
from app.modules.notifications import (
    DeliveryStatus,
    NotificationChannel,
    TemplateIn,
    events as notif_events,
    upsert_template,
)
from app.modules.notifications.models import NotificationDelivery
from app.modules.platform.events import (
    WILDCARD_EVENT_TYPE,
    Actor,
    ActorKind,
)
from app.modules.platform.events.bus import registry
from app.modules.platform.events.dispatcher import Dispatcher, DispatcherConfig
from app.modules.rules import (
    Action,
    ConditionGroup,
    Predicate,
    RuleCreateRequest,
    RuleDefinition,
    Trigger,
    create_rule,
    events as rules_events,
)
from app.modules.rules.handlers import evaluate_rules_on_any_event
from app.modules.wallet.handlers import create_wallet_on_customer_identified


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _wire_handlers():
    """Registra los handlers del bus para este escenario."""
    registry.clear()
    registry.on(
        customer_events.CUSTOMER_IDENTIFIED,
        handler_id="wallet.create_on_customer_identified",
    )(create_wallet_on_customer_identified)
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
            VALUES ('E2E Notif', 'e2e-notif', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(
        text("DELETE FROM tenants WHERE id = :id"), {"id": tid},
    )
    await integration_db.commit()


def _fast_config() -> DispatcherConfig:
    return DispatcherConfig(
        poll_interval=0.01, batch_size=20, max_handler_attempts=3,
    )


class TestEndToEnd:
    async def test_rule_fires_notification_send(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        # 1. Template
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.MEMBER, id=1),
            payload=TemplateIn(
                key="welcome_in_app",
                channel=NotificationChannel.IN_APP,
                name="Bienvenida in-app",
                body_text="Bienvenida a bordo, {{customer.full_name}}",
                purpose="transactional",
            ),
        )

        # 2. Regla — action notifications.send al identificarse
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.MEMBER, id=1),
            request=RuleCreateRequest(
                code="welcome_notif",
                definition=RuleDefinition(
                    name="Enviar bienvenida in-app",
                    trigger=Trigger(event="customer.identified"),
                    conditions=ConditionGroup(
                        all=[
                            Predicate(
                                path="data.first_time", op="eq", value=True,
                            ),
                        ],
                    ),
                    actions=[
                        Action(
                            type="notifications.send",
                            params={
                                "template_key": "welcome_in_app",
                                "channel": "in_app",
                            },
                        ),
                    ],
                ),
            ),
        )
        await integration_db.commit()

        # 3. Identify customer
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            request=IdentifyRequest(
                identity=IdentityIn(
                    kind=IdentityKind.EMAIL, value="e2e@notif.co",
                ),
                full_name="Cliente Notif",
            ),
        )
        await integration_db.commit()

        # 4. Correr dispatcher varias veces (deja procesar cadena
        #    completa: identified → wallet.created + rules.fired →
        #    notifications.message.queued/sent).
        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        for _ in range(5):
            processed = await dispatcher.tick()
            if processed == 0:
                break

        # 5. Assertions
        deliveries = list((
            await integration_db.execute(
                select(NotificationDelivery).where(
                    NotificationDelivery.tenant_id == tenant_id,
                    NotificationDelivery.customer_id == result.customer_id,
                )
            )
        ).scalars().all())

        assert len(deliveries) == 1
        d = deliveries[0]
        assert d.status is DeliveryStatus.DELIVERED   # in_app se marca así
        assert d.template_key == "welcome_in_app"
        assert d.rendered_body == "Bienvenida a bordo, Cliente Notif"
        assert d.related_event_id is not None

        # Cadena de eventos publicados incluye rules.rule.fired y
        # notifications.message.sent.
        from app.modules.platform.events.models import EventOutbox

        types_all = list((
            await integration_db.execute(
                select(EventOutbox.type)
                .where(EventOutbox.tenant_id == tenant_id)
                .order_by(EventOutbox.id.asc())
            )
        ).scalars().all())
        assert customer_events.CUSTOMER_IDENTIFIED in types_all
        assert rules_events.RULES_RULE_FIRED in types_all
        assert notif_events.NOTIFICATIONS_MESSAGE_QUEUED in types_all
        assert notif_events.NOTIFICATIONS_MESSAGE_SENT in types_all
