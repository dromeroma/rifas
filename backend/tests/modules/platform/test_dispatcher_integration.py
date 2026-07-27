"""Integration tests del dispatcher del event bus.

Requiere DATABASE_URL_TEST.

Cubre:
  - tick() consume pending y marca dispatched.
  - Handler exitoso persiste event_handled con status=success.
  - Handler que lanza excepción marca failed y bump attempts.
  - Reintento hasta max_handler_attempts, luego DEAD.
  - Un evento con múltiples handlers → todos se ejecutan aunque uno falle.
  - Idempotencia: reintentar un evento cuyo handler ya SUCCESS no re-ejecuta.
  - Sin handlers registrados → dispatched inmediatamente.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.modules.platform.events import (
    Actor,
    ActorKind,
    Event,
    Subject,
    publish,
    registry as global_registry,
)
from app.modules.platform.events.bus import EventRegistry
from app.modules.platform.events.dispatcher import Dispatcher, DispatcherConfig
from app.modules.platform.events.models import (
    EventHandled,
    EventOutbox,
    HandledStatus,
    OutboxStatus,
)


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _clean_global_registry():
    """El registry global se limpia después de cada test para aislarlos."""
    global_registry.clear()
    yield
    global_registry.clear()


def _fast_config(max_attempts: int = 3) -> DispatcherConfig:
    return DispatcherConfig(
        poll_interval=0.01,
        batch_size=10,
        max_handler_attempts=max_attempts,
        handler_timeout=5.0,
    )


def _mk_event(type_="customer.identified", **overrides) -> Event:
    base = dict(
        type=type_,
        tenant_id=1,
        actor=Actor(kind=ActorKind.SYSTEM),
        subject=Subject(kind="customer", id=1),
    )
    base.update(overrides)
    return Event(**base)


async def _outbox_row(db, event_id):
    return (
        await db.execute(select(EventOutbox).where(EventOutbox.event_id == event_id))
    ).scalar_one()


async def _handled_rows(db, event_id):
    return list(
        (
            await db.execute(
                select(EventHandled).where(EventHandled.event_id == event_id)
            )
        )
        .scalars()
        .all()
    )


class TestTick:
    async def test_dispatched_when_no_handlers(
        self, integration_sessionmaker, integration_db,
    ):
        ev = _mk_event(type_="unheard.of.event")
        await publish(ev, integration_db)
        await integration_db.commit()

        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        count = await dispatcher.tick()
        assert count == 1

        row = await _outbox_row(integration_db, ev.id)
        assert row.status == OutboxStatus.DISPATCHED
        assert row.dispatched_at is not None
        assert await _handled_rows(integration_db, ev.id) == []

    async def test_successful_handler_marks_success(
        self, integration_sessionmaker, integration_db,
    ):
        calls: list[str] = []

        @global_registry.on("customer.identified", handler_id="test.ok")
        async def _ok(event: Event, db) -> None:  # noqa: ARG001
            calls.append(event.id)

        ev = _mk_event()
        await publish(ev, integration_db)
        await integration_db.commit()

        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        await dispatcher.tick()

        assert calls == [ev.id]

        row = await _outbox_row(integration_db, ev.id)
        assert row.status == OutboxStatus.DISPATCHED

        handled = await _handled_rows(integration_db, ev.id)
        assert len(handled) == 1
        assert handled[0].status == HandledStatus.SUCCESS
        assert handled[0].handler_id == "test.ok"
        assert handled[0].attempts == 1

    async def test_failing_handler_marks_failed_and_retries(
        self, integration_sessionmaker, integration_db,
    ):
        attempts_counter = {"n": 0}

        @global_registry.on("customer.identified", handler_id="test.flaky")
        async def _flaky(event: Event, db) -> None:  # noqa: ARG001
            attempts_counter["n"] += 1
            raise RuntimeError("boom")

        ev = _mk_event()
        await publish(ev, integration_db)
        await integration_db.commit()

        dispatcher = Dispatcher(
            integration_sessionmaker, config=_fast_config(max_attempts=3),
        )
        # tick #1 — falla
        await dispatcher.tick()
        # tick #2 — reintento, falla
        await dispatcher.tick()
        # tick #3 — reintento, DEAD
        await dispatcher.tick()

        assert attempts_counter["n"] == 3

        handled = await _handled_rows(integration_db, ev.id)
        assert len(handled) == 1
        assert handled[0].status == HandledStatus.DEAD
        assert handled[0].attempts == 3
        assert "boom" in (handled[0].last_error or "")

    async def test_multiple_handlers_all_executed(
        self, integration_sessionmaker, integration_db,
    ):
        seen: dict[str, int] = {"h1": 0, "h2": 0}

        @global_registry.on("wallet.points.credited", handler_id="h1")
        async def _h1(event: Event, db) -> None:  # noqa: ARG001
            seen["h1"] += 1

        @global_registry.on("wallet.points.credited", handler_id="h2")
        async def _h2(event: Event, db) -> None:  # noqa: ARG001
            seen["h2"] += 1

        ev = _mk_event(type_="wallet.points.credited")
        await publish(ev, integration_db)
        await integration_db.commit()

        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        await dispatcher.tick()

        assert seen == {"h1": 1, "h2": 1}
        handled = await _handled_rows(integration_db, ev.id)
        assert {h.handler_id for h in handled} == {"h1", "h2"}
        assert all(h.status == HandledStatus.SUCCESS for h in handled)

    async def test_one_failing_handler_does_not_block_others(
        self, integration_sessionmaker, integration_db,
    ):
        seen = {"good": 0}

        @global_registry.on("wallet.points.credited", handler_id="good")
        async def _good(event: Event, db) -> None:  # noqa: ARG001
            seen["good"] += 1

        @global_registry.on("wallet.points.credited", handler_id="bad")
        async def _bad(event: Event, db) -> None:  # noqa: ARG001
            raise ValueError("nope")

        ev = _mk_event(type_="wallet.points.credited")
        await publish(ev, integration_db)
        await integration_db.commit()

        dispatcher = Dispatcher(
            integration_sessionmaker, config=_fast_config(max_attempts=1),
        )
        await dispatcher.tick()

        assert seen["good"] == 1

        handled = {h.handler_id: h for h in await _handled_rows(integration_db, ev.id)}
        assert handled["good"].status == HandledStatus.SUCCESS
        assert handled["bad"].status == HandledStatus.DEAD

    async def test_idempotent_no_reexecute_success(
        self, integration_sessionmaker, integration_db,
    ):
        calls = {"n": 0}

        @global_registry.on("customer.identified", handler_id="once")
        async def _once(event: Event, db) -> None:  # noqa: ARG001
            calls["n"] += 1

        ev = _mk_event()
        await publish(ev, integration_db)
        await integration_db.commit()

        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        await dispatcher.tick()

        # Forzamos otro tick sobre el mismo evento reponiendo status a PENDING.
        row = await _outbox_row(integration_db, ev.id)
        row.status = OutboxStatus.PENDING
        row.dispatched_at = None
        await integration_db.commit()

        await dispatcher.tick()

        # El handler ya está en SUCCESS → no se re-ejecuta.
        assert calls["n"] == 1
