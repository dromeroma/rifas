"""End-to-end: eventos del bus se persisten como audit_logs.

Escenario canónico:
  1. Handler audit registrado en el bus.
  2. Publicar customer.identified (MEMBER actor) → audit lo captura.
  3. Publicar customer.identified (SYSTEM actor) → NO se captura.
  4. Publicar tenant.activated (SYSTEM actor) → SÍ se captura.
  5. Publicar el mismo event.id dos veces → una sola fila (idempotencia).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.audit.handlers import record_on_any_event
from app.modules.audit.models import AuditLog
from app.modules.platform.events import (
    WILDCARD_EVENT_TYPE,
    Actor,
    ActorKind,
    Event,
    Subject,
    publish,
)
from app.modules.platform.events.bus import registry
from app.modules.platform.events.dispatcher import Dispatcher, DispatcherConfig


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _wire_handler():
    registry.clear()
    registry.on(
        WILDCARD_EVENT_TYPE,
        handler_id="audit.record_on_any_event",
    )(record_on_any_event)
    yield
    registry.clear()


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Audit E2E', 'audit-e2e', true, now(), now())
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


async def _publish_and_drain(sm, db, event: Event):
    await publish(event, db)
    await db.commit()
    dispatcher = Dispatcher(sm, config=_fast_config())
    for _ in range(6):
        processed = await dispatcher.tick()
        if processed == 0:
            break


class TestEndToEnd:
    async def test_member_actor_persisted(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        await _publish_and_drain(
            integration_sessionmaker, integration_db,
            Event(
                type="tenant.profile.updated",
                tenant_id=tenant_id,
                actor=Actor(kind=ActorKind.MEMBER, id=7),
                subject=Subject(kind="tenant_profile", id=1),
                data={"brand_name": "New"},
            ),
        )
        rows = list(
            (
                await integration_db.execute(
                    select(AuditLog).where(AuditLog.tenant_id == tenant_id)
                )
            ).scalars().all()
        )
        assert len(rows) == 1
        assert rows[0].action == "tenant.profile.updated"
        assert rows[0].actor_label == "member:7"

    async def test_system_actor_generic_event_not_captured(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        await _publish_and_drain(
            integration_sessionmaker, integration_db,
            Event(
                type="customer.identified",
                tenant_id=tenant_id,
                actor=Actor(kind=ActorKind.SYSTEM),
                subject=Subject(kind="customer", id=1),
                data={"first_time": True},
            ),
        )
        rows = list(
            (
                await integration_db.execute(
                    select(AuditLog).where(AuditLog.tenant_id == tenant_id)
                )
            ).scalars().all()
        )
        assert len(rows) == 0

    async def test_system_tenant_activated_captured(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        await _publish_and_drain(
            integration_sessionmaker, integration_db,
            Event(
                type="tenant.activated",
                tenant_id=tenant_id,
                actor=Actor(kind=ActorKind.SYSTEM),
                subject=Subject(kind="tenant_profile", id=1),
                data={"activated_by": "member:1"},
            ),
        )
        rows = list(
            (
                await integration_db.execute(
                    select(AuditLog).where(AuditLog.tenant_id == tenant_id)
                )
            ).scalars().all()
        )
        assert len(rows) == 1
        assert rows[0].action == "tenant.activated"
        assert rows[0].severity.value == "notice"
