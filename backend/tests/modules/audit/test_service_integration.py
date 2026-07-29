"""Integration tests del service audit — record + list_entries."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import text

from app.modules.audit import (
    AuditSeverity,
    list_entries,
    record,
)
from app.modules.audit.models import AuditLog
from app.modules.platform.events import Actor, ActorKind
from sqlalchemy import select


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Audit Test', 'audit-test', true, now(), now())
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
    return Actor(kind=ActorKind.MEMBER, id=42)


class TestRecord:
    async def test_basic_record(self, integration_db, tenant_id):
        row = await record(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            action="tenant.profile.updated",
            resource_kind="tenant_profile",
            resource_id="1",
            changes={"brand_name": "Foo"},
            source_event_id="evt_test1",
        )
        await integration_db.commit()

        assert row is not None
        assert row.tenant_id == tenant_id
        assert row.actor_label == "member:42"
        assert row.action == "tenant.profile.updated"
        assert row.severity is AuditSeverity.INFO

    async def test_idempotency_on_source_event(self, integration_db, tenant_id):
        for _ in range(3):
            await record(
                integration_db,
                tenant_id=tenant_id,
                actor=_actor(),
                action="tenant.profile.updated",
                source_event_id="evt_dup",
                emit_event=False,
            )
        await integration_db.commit()

        count = int(
            (
                await integration_db.execute(
                    select(AuditLog).where(AuditLog.source_event_id == "evt_dup")
                )
            ).all().__len__()
        )
        assert count == 1

    async def test_severity_persisted(self, integration_db, tenant_id):
        row = await record(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            action="tenant.activated",
            severity=AuditSeverity.NOTICE,
            source_event_id="evt_notice",
        )
        await integration_db.commit()
        assert row.severity is AuditSeverity.NOTICE


class TestListEntries:
    async def _seed(self, db, tenant_id):
        # 3 rules-published + 1 tenant-activated
        for i in range(3):
            await record(
                db, tenant_id=tenant_id, actor=_actor(),
                action="rules.rule.published",
                resource_kind="rule", resource_id=str(100 + i),
                source_event_id=f"evt_rp_{i}",
                severity=AuditSeverity.NOTICE,
                emit_event=False,
            )
        await record(
            db, tenant_id=tenant_id, actor=Actor(kind=ActorKind.SYSTEM),
            action="tenant.activated",
            resource_kind="tenant_profile", resource_id="1",
            source_event_id="evt_act",
            severity=AuditSeverity.NOTICE,
            emit_event=False,
        )
        await db.commit()

    async def test_lists_desc(self, integration_db, tenant_id):
        await self._seed(integration_db, tenant_id)
        page = await list_entries(integration_db, tenant_id=tenant_id, limit=10)
        assert len(page.items) == 4
        assert page.items[0].id > page.items[1].id  # DESC

    async def test_filters_by_action_prefix(self, integration_db, tenant_id):
        await self._seed(integration_db, tenant_id)
        page = await list_entries(
            integration_db, tenant_id=tenant_id, action_prefix="rules.",
        )
        assert len(page.items) == 3
        assert all(i.action.startswith("rules.") for i in page.items)

    async def test_filters_by_resource(self, integration_db, tenant_id):
        await self._seed(integration_db, tenant_id)
        page = await list_entries(
            integration_db, tenant_id=tenant_id,
            resource_kind="rule", resource_id="101",
        )
        assert len(page.items) == 1
        assert page.items[0].resource_id == "101"

    async def test_keyset_pagination(self, integration_db, tenant_id):
        await self._seed(integration_db, tenant_id)
        page1 = await list_entries(integration_db, tenant_id=tenant_id, limit=2)
        assert len(page1.items) == 2
        assert page1.next_before_id is not None

        page2 = await list_entries(
            integration_db, tenant_id=tenant_id,
            limit=2, before_id=page1.next_before_id,
        )
        assert len(page2.items) == 2
        assert page2.items[0].id < page1.items[-1].id
