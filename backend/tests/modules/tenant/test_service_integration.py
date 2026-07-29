"""Integration tests del service tenant.

Cubre: bootstrap, update patch, activate/pause con evento correspondiente.
Requiere DATABASE_URL_TEST.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.platform.events import Actor, ActorKind
from app.modules.platform.events.models import EventOutbox
from app.modules.tenant import (
    InvalidActivationError,
    ProfileIn,
    TenantStatus,
    TenantVertical,
    activate_tenant,
    events as tenant_events,
    get_or_create_profile,
    pause_tenant,
    update_profile,
)


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Tenant Test', 'tenant-test', true, now(), now())
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


class TestProfile:
    async def test_get_or_create_is_idempotent(self, integration_db, tenant_id):
        p1 = await get_or_create_profile(
            integration_db, tenant_id=tenant_id, actor=_actor(),
        )
        p2 = await get_or_create_profile(
            integration_db, tenant_id=tenant_id, actor=_actor(),
        )
        assert p1.id == p2.id
        assert p1.status is TenantStatus.DRAFT
        assert p1.timezone == "America/Bogota"
        assert p1.locale == "es-CO"
        assert p1.currency == "COP"

        # Solo un evento creado (idempotente).
        rows = list(
            (
                await integration_db.execute(
                    select(EventOutbox.type).where(
                        EventOutbox.tenant_id == tenant_id,
                        EventOutbox.type == tenant_events.TENANT_PROFILE_CREATED,
                    )
                )
            ).scalars().all()
        )
        assert len(rows) == 1

    async def test_update_emits_only_when_changed(self, integration_db, tenant_id):
        await get_or_create_profile(
            integration_db, tenant_id=tenant_id, actor=_actor(),
        )
        await integration_db.commit()

        # Update efectivo
        await update_profile(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=ProfileIn(
                brand_name="Deimer Store",
                brand_color_primary="#5b8def",
                vertical=TenantVertical.RETAIL,
            ),
        )
        await integration_db.commit()

        # Segundo update SIN cambios (mismos valores) — no emite otro evento
        await update_profile(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=ProfileIn(
                brand_name="Deimer Store",
                brand_color_primary="#5b8def",
            ),
        )
        await integration_db.commit()

        types = list(
            (
                await integration_db.execute(
                    select(EventOutbox.type).where(
                        EventOutbox.tenant_id == tenant_id,
                        EventOutbox.type == tenant_events.TENANT_PROFILE_UPDATED,
                    )
                )
            ).scalars().all()
        )
        assert len(types) == 1   # solo el primero, el segundo fue no-op


class TestActivation:
    async def test_activate_without_flag_raises(self, integration_db, tenant_id):
        with pytest.raises(InvalidActivationError) as info:
            await activate_tenant(
                integration_db,
                tenant_id=tenant_id,
                actor=_actor(),
                required_completed=False,
                missing=["first_customer"],
            )
        assert "first_customer" in info.value.missing

    async def test_activate_sets_status_and_emits(self, integration_db, tenant_id):
        profile = await activate_tenant(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            required_completed=True,
        )
        await integration_db.commit()

        assert profile.status is TenantStatus.ACTIVE
        assert profile.activated_at is not None
        assert profile.activated_by == "member:1"

        types = list(
            (
                await integration_db.execute(
                    select(EventOutbox.type).where(
                        EventOutbox.tenant_id == tenant_id,
                        EventOutbox.type == tenant_events.TENANT_ACTIVATED,
                    )
                )
            ).scalars().all()
        )
        assert len(types) == 1

    async def test_activate_is_idempotent(self, integration_db, tenant_id):
        await activate_tenant(
            integration_db,
            tenant_id=tenant_id, actor=_actor(), required_completed=True,
        )
        await activate_tenant(
            integration_db,
            tenant_id=tenant_id, actor=_actor(), required_completed=True,
        )
        await integration_db.commit()

        types = list(
            (
                await integration_db.execute(
                    select(EventOutbox.type).where(
                        EventOutbox.tenant_id == tenant_id,
                        EventOutbox.type == tenant_events.TENANT_ACTIVATED,
                    )
                )
            ).scalars().all()
        )
        assert len(types) == 1   # no re-emite

    async def test_pause_transitions_and_emits(self, integration_db, tenant_id):
        await activate_tenant(
            integration_db,
            tenant_id=tenant_id, actor=_actor(), required_completed=True,
        )
        profile = await pause_tenant(
            integration_db,
            tenant_id=tenant_id, actor=_actor(), reason="pruebas",
        )
        await integration_db.commit()

        assert profile.status is TenantStatus.PAUSED
        assert profile.paused_at is not None

        types = list(
            (
                await integration_db.execute(
                    select(EventOutbox.type).where(
                        EventOutbox.tenant_id == tenant_id,
                        EventOutbox.type == tenant_events.TENANT_PAUSED,
                    )
                )
            ).scalars().all()
        )
        assert len(types) == 1
