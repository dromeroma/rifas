"""Integration tests del service onboarding.

Cubre: bootstrap on-demand, complete_step, skip_step, reopen,
request_activation con checklist incompleto y con checklist completo,
emisión única de onboarding.tenant.completed.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.onboarding import (
    OnboardingStepStatus,
    complete_step,
    events as onb_events,
    get_checklist,
    reopen_step,
    request_activation,
    skip_step,
)
from app.modules.platform.events import Actor, ActorKind
from app.modules.platform.events.models import EventOutbox
from app.modules.tenant import (
    InvalidActivationError,
    TenantStatus,
    get_or_create_profile,
)


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Onb Test', 'onb-test', true, now(), now())
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


class TestChecklist:
    async def test_bootstrap_creates_all_default_steps(self, integration_db, tenant_id):
        checklist = await get_checklist(integration_db, tenant_id=tenant_id)
        await integration_db.commit()

        assert checklist.total == 6
        assert checklist.completed == 0
        assert checklist.pending == 6
        assert checklist.progress == 0.0
        assert checklist.activation_ready is False
        assert checklist.activated is False
        # los 5 required más go_live están missing (go_live también required)
        assert set(checklist.required_missing) >= {
            "brand_setup", "first_customer", "first_rule",
            "first_notification", "go_live",
        }

    async def test_bootstrap_is_idempotent(self, integration_db, tenant_id):
        await get_checklist(integration_db, tenant_id=tenant_id)
        await get_checklist(integration_db, tenant_id=tenant_id)
        await integration_db.commit()

        result = await integration_db.execute(
            text(
                "SELECT count(*) FROM onboarding_steps WHERE tenant_id = :t"
            ),
            {"t": tenant_id},
        )
        assert int(result.scalar_one()) == 6


class TestTransitions:
    async def test_complete_step_emits_event_and_is_idempotent(
        self, integration_db, tenant_id,
    ):
        await get_checklist(integration_db, tenant_id=tenant_id)
        await complete_step(
            integration_db,
            tenant_id=tenant_id, key="brand_setup", actor=_actor(),
        )
        # Segundo complete es no-op
        await complete_step(
            integration_db,
            tenant_id=tenant_id, key="brand_setup", actor=_actor(),
        )
        await integration_db.commit()

        types = list(
            (
                await integration_db.execute(
                    select(EventOutbox.type).where(
                        EventOutbox.tenant_id == tenant_id,
                        EventOutbox.type == onb_events.ONBOARDING_STEP_COMPLETED,
                    )
                )
            ).scalars().all()
        )
        assert len(types) == 1

    async def test_skip_step_counts_as_done(self, integration_db, tenant_id):
        await get_checklist(integration_db, tenant_id=tenant_id)
        await skip_step(
            integration_db,
            tenant_id=tenant_id, key="first_rule_fired",
            actor=_actor(), reason="no aplica ahora",
        )
        await integration_db.commit()

        checklist = await get_checklist(integration_db, tenant_id=tenant_id)
        skipped = [s for s in checklist.steps if s.key == "first_rule_fired"]
        assert skipped[0].status is OnboardingStepStatus.SKIPPED
        assert checklist.skipped == 1

    async def test_reopen_returns_to_pending(self, integration_db, tenant_id):
        await get_checklist(integration_db, tenant_id=tenant_id)
        await complete_step(
            integration_db,
            tenant_id=tenant_id, key="brand_setup", actor=_actor(),
        )
        row = await reopen_step(
            integration_db,
            tenant_id=tenant_id, key="brand_setup", actor=_actor(),
        )
        await integration_db.commit()

        assert row.status is OnboardingStepStatus.PENDING
        assert row.completed_at is None


class TestActivation:
    async def test_activation_blocks_when_required_missing(
        self, integration_db, tenant_id,
    ):
        # Sólo completamos algunos steps — no todos los required.
        await get_checklist(integration_db, tenant_id=tenant_id)
        await complete_step(
            integration_db,
            tenant_id=tenant_id, key="brand_setup", actor=_actor(),
        )
        await integration_db.commit()

        with pytest.raises(InvalidActivationError) as info:
            await request_activation(
                integration_db, tenant_id=tenant_id, actor=_actor(),
            )
        # go_live NO debe aparecer en missing (auto-fires al activar).
        assert "go_live" not in info.value.missing
        assert "first_customer" in info.value.missing

    async def test_activation_succeeds_when_all_required_done(
        self, integration_db, tenant_id,
    ):
        await get_checklist(integration_db, tenant_id=tenant_id)
        for key in ("brand_setup", "first_customer", "first_rule", "first_notification"):
            await complete_step(
                integration_db,
                tenant_id=tenant_id, key=key, actor=_actor(),
            )
        # first_rule_fired es optional — no lo tocamos
        await integration_db.commit()

        profile = await request_activation(
            integration_db, tenant_id=tenant_id, actor=_actor(),
        )
        await integration_db.commit()

        assert profile.status is TenantStatus.ACTIVE
        assert profile.activated_at is not None

    async def test_tenant_completed_emitted_once(
        self, integration_db, tenant_id,
    ):
        """Cuando el último required se completa, se emite el evento una sola vez."""
        await get_checklist(integration_db, tenant_id=tenant_id)
        # Completamos todos menos el último; para hacer que go_live cuente
        # sin activar realmente el tenant, lo skipeamos.
        for key in (
            "brand_setup", "first_customer", "first_rule",
            "first_notification", "go_live",
        ):
            await complete_step(
                integration_db,
                tenant_id=tenant_id, key=key, actor=_actor(),
            )
        await integration_db.commit()

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

        # Reopen + close otro paso no re-emite.
        await reopen_step(
            integration_db,
            tenant_id=tenant_id, key="first_rule_fired", actor=_actor(),
        )
        await complete_step(
            integration_db,
            tenant_id=tenant_id, key="first_rule_fired", actor=_actor(),
        )
        await integration_db.commit()

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
        assert len(types) == 1   # sigue siendo uno
