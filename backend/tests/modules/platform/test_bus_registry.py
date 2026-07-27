"""Unit tests para el registro de handlers del bus.

Prueban:
  - @registry.on registra handler y lo hace listable.
  - handler_id auto-derivado desde module.qualname.
  - Registrar el mismo (event_type, handler_id) es idempotente.
  - handlers_for devuelve copia (mutar la copia no afecta el registro).
  - Sin handlers registrados => lista vacía.
  - clear() resetea todo (para tests).
"""
from __future__ import annotations

import pytest

from app.modules.platform.events.bus import EventRegistry
from app.modules.platform.events import Event, Actor, ActorKind, Subject


@pytest.fixture
def reg() -> EventRegistry:
    return EventRegistry()


async def _dummy_ok(event: Event, db) -> None:  # noqa: ARG001
    return None


async def _dummy_alt(event: Event, db) -> None:  # noqa: ARG001
    return None


class TestRegistration:
    def test_on_registers_handler(self, reg: EventRegistry):
        reg.on("customer.identified")(_dummy_ok)
        handlers = reg.handlers_for("customer.identified")
        assert len(handlers) == 1
        hid, fn = handlers[0]
        assert fn is _dummy_ok
        assert hid.endswith("._dummy_ok")

    def test_explicit_handler_id(self, reg: EventRegistry):
        reg.on("customer.identified", handler_id="custom.id")(_dummy_ok)
        handlers = reg.handlers_for("customer.identified")
        assert handlers[0][0] == "custom.id"

    def test_multiple_handlers_same_event(self, reg: EventRegistry):
        reg.on("customer.identified")(_dummy_ok)
        reg.on("customer.identified")(_dummy_alt)
        handlers = reg.handlers_for("customer.identified")
        assert len(handlers) == 2

    def test_multiple_events_same_handler(self, reg: EventRegistry):
        reg.on("customer.identified")(_dummy_ok)
        reg.on("customer.merged")(_dummy_ok)
        assert len(reg.handlers_for("customer.identified")) == 1
        assert len(reg.handlers_for("customer.merged")) == 1

    def test_re_register_overwrites(self, reg: EventRegistry, caplog):
        reg.on("x.y.z", handler_id="h1")(_dummy_ok)
        reg.on("x.y.z", handler_id="h1")(_dummy_alt)
        handlers = reg.handlers_for("x.y.z")
        assert len(handlers) == 1
        assert handlers[0][1] is _dummy_alt

    def test_unknown_event_returns_empty(self, reg: EventRegistry):
        assert reg.handlers_for("no.such.event") == []


class TestListImmutability:
    def test_returned_list_is_copy(self, reg: EventRegistry):
        reg.on("t.e.a")(_dummy_ok)
        got = reg.handlers_for("t.e.a")
        got.clear()
        # el registro original queda intacto
        assert len(reg.handlers_for("t.e.a")) == 1


class TestClear:
    def test_clear_removes_all(self, reg: EventRegistry):
        reg.on("a.b.c")(_dummy_ok)
        reg.on("d.e.f")(_dummy_ok)
        reg.clear()
        assert reg.handlers_for("a.b.c") == []
        assert reg.handlers_for("d.e.f") == []


def _sample_event(type_="customer.identified") -> Event:
    return Event(
        type=type_,
        tenant_id=1,
        actor=Actor(kind=ActorKind.SYSTEM),
        subject=Subject(kind="customer", id=1),
    )


class TestHandlerContract:
    """Documenta el contrato que espera el dispatcher del handler."""

    async def test_handler_signature_accepts_event_and_db(self):
        # Un handler bien formado NO debe fallar por su firma.
        # (el dispatcher pasa Event y AsyncSession).
        ev = _sample_event()
        await _dummy_ok(ev, db=None)  # type: ignore[arg-type]
