"""End-to-end: los handlers del bus auto-completan el checklist.

Escenario:
  1. identify customer   → handler auto-completa `first_customer`.
  2. update profile brand → handler auto-completa `brand_setup`.
  3. create + publish rule → handler auto-completa `first_rule`.
  4. send notification    → handler auto-completa `first_notification`.
  5. request_activation   → tenant.activated → handler completa `go_live`
                            + emite onboarding.tenant.completed.

Todo pasa vía dispatcher — el pipeline es el real.
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
    NotificationChannel,
    SendRequest,
    TemplateIn,
    events as notif_events,
    send as notifications_send,
    upsert_template,
)
from app.modules.onboarding import (
    OnboardingStepStatus,
    events as onb_events,
    get_checklist,
    request_activation,
)
from app.modules.onboarding.handlers import (
    brand_setup_on_profile_updated,
    first_customer_on_identified,
    first_notification_on_sent,
    first_rule_fired_on_fired,
    first_rule_on_published,
    go_live_on_activated,
)
from app.modules.platform.events import (
    WILDCARD_EVENT_TYPE,
    Actor,
    ActorKind,
)
from app.modules.platform.events.bus import registry
from app.modules.platform.events.dispatcher import Dispatcher, DispatcherConfig
from app.modules.platform.events.models import EventOutbox
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
from app.modules.tenant import (
    ProfileIn,
    TenantStatus,
    update_profile,
)
from app.modules.wallet.handlers import create_wallet_on_customer_identified


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _wire_handlers():
    """Reregistra los handlers del bus para este escenario."""
    registry.clear()

    # customer.identified → wallet + onboarding
    registry.on(
        customer_events.CUSTOMER_IDENTIFIED,
        handler_id="wallet.create_on_customer_identified",
    )(create_wallet_on_customer_identified)
    registry.on(
        customer_events.CUSTOMER_IDENTIFIED,
        handler_id="onboarding.first_customer_on_identified",
    )(first_customer_on_identified)

    # rules.rule.published → onboarding
    registry.on(
        rules_events.RULES_RULE_PUBLISHED,
        handler_id="onboarding.first_rule_on_published",
    )(first_rule_on_published)

    # rules.rule.fired → onboarding
    registry.on(
        rules_events.RULES_RULE_FIRED,
        handler_id="onboarding.first_rule_fired_on_fired",
    )(first_rule_fired_on_fired)

    # notifications.message.sent → onboarding
    registry.on(
        notif_events.NOTIFICATIONS_MESSAGE_SENT,
        handler_id="onboarding.first_notification_on_sent",
    )(first_notification_on_sent)

    # tenant.profile.updated → onboarding
    from app.modules.tenant import events as tenant_events

    registry.on(
        tenant_events.TENANT_PROFILE_UPDATED,
        handler_id="onboarding.brand_setup_on_profile_updated",
    )(brand_setup_on_profile_updated)

    # tenant.activated → onboarding
    registry.on(
        tenant_events.TENANT_ACTIVATED,
        handler_id="onboarding.go_live_on_activated",
    )(go_live_on_activated)

    # wildcard: rules engine
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
            VALUES ('Onb E2E', 'onb-e2e', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


def _fast_config() -> DispatcherConfig:
    return DispatcherConfig(
        poll_interval=0.01, batch_size=20, max_handler_attempts=3,
    )


async def _drain(dispatcher: Dispatcher, *, max_rounds: int = 10) -> None:
    for _ in range(max_rounds):
        processed = await dispatcher.tick()
        if processed == 0:
            return


class TestEndToEnd:
    async def test_full_pipeline_completes_checklist(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        # 0. Bootstrap
        await get_checklist(integration_db, tenant_id=tenant_id)
        await integration_db.commit()

        actor = Actor(kind=ActorKind.MEMBER, id=1)
        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())

        # 1. Update brand — dispara brand_setup
        await update_profile(
            integration_db,
            tenant_id=tenant_id,
            actor=actor,
            payload=ProfileIn(
                brand_name="Perks E2E",
                brand_color_primary="#22c55e",
            ),
        )
        await integration_db.commit()

        # 2. Identify customer — dispara first_customer
        ident = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=actor,
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="e2e@onb.co"),
                full_name="E2E Customer",
            ),
        )
        await integration_db.commit()

        # 3. Create rule — create_rule ya emite rules.rule.published
        await create_rule(
            integration_db,
            tenant_id=tenant_id,
            actor=actor,
            request=RuleCreateRequest(
                code="noop",
                definition=RuleDefinition(
                    name="Regla noop",
                    trigger=Trigger(event="customer.identified"),
                    conditions=ConditionGroup(
                        all=[
                            Predicate(
                                path="data.first_time", op="eq", value=False,
                            ),
                        ],
                    ),
                    actions=[],
                ),
            ),
        )
        await integration_db.commit()

        # 4. Send notification — dispara first_notification
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=actor,
            payload=TemplateIn(
                key="ping",
                channel=NotificationChannel.IN_APP,
                name="Ping",
                body_text="hola",
                purpose="transactional",
            ),
        )
        await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=actor,
            req=SendRequest(
                template_key="ping",
                channel=NotificationChannel.IN_APP,
                customer_id=ident.customer_id,
            ),
        )
        await integration_db.commit()

        # Correr dispatcher para procesar toda la cascada.
        await _drain(dispatcher, max_rounds=15)

        checklist = await get_checklist(integration_db, tenant_id=tenant_id)
        by_key = {s.key: s for s in checklist.steps}

        # Los 4 auto-eventos de esta fase → completados.
        for key in (
            "brand_setup", "first_customer", "first_rule", "first_notification",
        ):
            assert by_key[key].status is OnboardingStepStatus.COMPLETED, (
                f"{key} debería estar completed, está {by_key[key].status.value}"
            )
        # go_live sigue pending (nadie activó).
        assert by_key["go_live"].status is OnboardingStepStatus.PENDING

        # 5. Request activation — dispara tenant.activated → go_live
        profile = await request_activation(
            integration_db, tenant_id=tenant_id, actor=actor,
        )
        await integration_db.commit()
        assert profile.status is TenantStatus.ACTIVE

        await _drain(dispatcher, max_rounds=10)

        checklist = await get_checklist(integration_db, tenant_id=tenant_id)
        by_key = {s.key: s for s in checklist.steps}
        assert by_key["go_live"].status is OnboardingStepStatus.COMPLETED
        assert checklist.activated is True

        # onboarding.tenant.completed emitido exactamente una vez.
        types = list(
            (
                await integration_db.execute(
                    select(EventOutbox.type).where(
                        EventOutbox.tenant_id == tenant_id,
                        EventOutbox.type == onb_events.ONBOARDING_TENANT_COMPLETED,
                    )
                )
            ).scalars().all()
        )
        assert len(types) == 1
