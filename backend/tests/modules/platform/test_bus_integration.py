"""Integration tests del bus contra Postgres real.

Requiere DATABASE_URL_TEST. Saltado por default (ver conftest).

Cubre:
  - publish() inserta fila en event_outbox dentro de la transacción.
  - Rollback elimina el evento (atomicidad outbox).
  - Loop detection lanza al superar causation_depth.
  - Idempotency key persiste correctamente.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.modules.platform.events import (
    Actor,
    ActorKind,
    Event,
    EventContext,
    Subject,
    publish,
)
from app.modules.platform.events.bus import MAX_CAUSATION_DEPTH
from app.modules.platform.events.errors import LoopDetectedError
from app.modules.platform.events.models import EventOutbox, OutboxStatus


pytestmark = pytest.mark.integration


def _sample_event(**overrides) -> Event:
    base = dict(
        type="customer.identified",
        tenant_id=1,
        actor=Actor(kind=ActorKind.SYSTEM),
        subject=Subject(kind="customer", id=1),
        data={"source": "test"},
    )
    base.update(overrides)
    return Event(**base)


class TestPublish:
    async def test_persists_in_outbox_after_commit(self, integration_db):
        ev = _sample_event()
        await publish(ev, integration_db)
        await integration_db.commit()

        row = (
            await integration_db.execute(
                select(EventOutbox).where(EventOutbox.event_id == ev.id)
            )
        ).scalar_one()
        assert row.type == ev.type
        assert row.status == OutboxStatus.PENDING
        assert row.attempts == 0
        assert row.data == {"source": "test"}
        assert row.actor == {"kind": "system", "id": None, "on_behalf_of": None}

    async def test_rollback_removes_event(self, integration_db):
        ev = _sample_event()
        await publish(ev, integration_db)
        await integration_db.rollback()

        row = (
            await integration_db.execute(
                select(EventOutbox).where(EventOutbox.event_id == ev.id)
            )
        ).scalar_one_or_none()
        assert row is None

    async def test_loop_detection_at_max_depth(self, integration_db):
        ev = _sample_event(
            context=EventContext(causation_depth=MAX_CAUSATION_DEPTH + 1),
        )
        with pytest.raises(LoopDetectedError) as exc_info:
            await publish(ev, integration_db)
        assert exc_info.value.limit == MAX_CAUSATION_DEPTH
        assert exc_info.value.chain_length == MAX_CAUSATION_DEPTH + 1

    async def test_idempotency_key_persists(self, integration_db):
        ev = _sample_event(idempotency_key="abc-123")
        await publish(ev, integration_db)
        await integration_db.commit()

        row = (
            await integration_db.execute(
                select(EventOutbox).where(EventOutbox.event_id == ev.id)
            )
        ).scalar_one()
        assert row.idempotency_key == "abc-123"
