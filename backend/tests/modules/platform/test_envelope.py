"""Unit tests para platform.events.envelope.

Prueban:
  - Defaults sensatos (id auto, occurred_at auto, causation_depth=0).
  - Validación del `type` (naming <context>.<entity>.<action>).
  - Inmutabilidad (Pydantic frozen).
  - Serialización JSON.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.modules.platform.events import (
    Actor,
    ActorKind,
    Event,
    EventContext,
    Subject,
)
from app.modules.platform.ids import is_valid_id


def _actor() -> Actor:
    return Actor(kind=ActorKind.SYSTEM)


def _subject(kind: str = "customer", cid: int = 1) -> Subject:
    return Subject(kind=kind, id=cid)


def _event(type_: str = "customer.identified", **overrides) -> Event:
    kwargs = {
        "type": type_,
        "tenant_id": 42,
        "actor": _actor(),
        "subject": _subject(),
    }
    kwargs.update(overrides)
    return Event(**kwargs)


class TestDefaults:
    def test_id_auto_generated_with_evt_prefix(self):
        ev = _event()
        assert ev.id.startswith("evt_")
        assert is_valid_id(ev.id, prefix="evt")

    def test_occurred_at_auto_utc(self):
        before = datetime.now(timezone.utc) - timedelta(seconds=1)
        ev = _event()
        after = datetime.now(timezone.utc) + timedelta(seconds=1)
        assert before <= ev.occurred_at <= after

    def test_causation_depth_default_zero(self):
        ev = _event()
        assert ev.context.causation_depth == 0

    def test_version_default_one(self):
        ev = _event()
        assert ev.version == 1

    def test_empty_data_default(self):
        ev = _event()
        assert ev.data == {}


class TestTypeValidation:
    @pytest.mark.parametrize(
        "good",
        [
            "customer.identified",
            "wallet.points.credited",
            "raffle.ticket.paid",
            "gamification.level.up",
            "campaign.customer.entered",
        ],
    )
    def test_valid_types(self, good):
        ev = _event(type_=good)
        assert ev.type == good

    @pytest.mark.parametrize(
        "bad",
        [
            "customer",                       # 1 nivel
            "a.b.c.d",                        # 4 niveles
            "Customer.Identified",            # mayúsculas
            "customer.",                      # segmento vacío
            "customer.iden-tified",           # guion
            "customer..identified",           # doble punto
            " customer.identified",           # espacio inicial
            "customer.iden tified",           # espacio interno
        ],
    )
    def test_invalid_types_rejected(self, bad):
        with pytest.raises(Exception):  # ValidationError o ValueError
            _event(type_=bad)


class TestSubjectValidation:
    def test_empty_kind_rejected(self):
        with pytest.raises(Exception):
            Subject(kind="", id=1)

    def test_whitespace_kind_rejected(self):
        with pytest.raises(Exception):
            Subject(kind="   ", id=1)

    def test_kind_normalized_lowercase(self):
        s = Subject(kind="CUSTOMER", id=1)
        assert s.kind == "customer"


class TestImmutability:
    def test_event_is_frozen(self):
        ev = _event()
        with pytest.raises(Exception):
            ev.type = "otro.evento.cosa"  # type: ignore[misc]

    def test_actor_is_frozen(self):
        actor = _actor()
        with pytest.raises(Exception):
            actor.kind = ActorKind.MEMBER  # type: ignore[misc]

    def test_subject_is_frozen(self):
        s = _subject()
        with pytest.raises(Exception):
            s.id = 999  # type: ignore[misc]


class TestSerialization:
    def test_model_dump_roundtrip(self):
        ev = _event(
            type_="wallet.points.credited",
            data={"amount": 100, "reason": "purchase"},
            idempotency_key="idk-1",
        )
        payload = ev.model_dump(mode="json")
        assert payload["type"] == "wallet.points.credited"
        assert payload["data"] == {"amount": 100, "reason": "purchase"}
        assert payload["idempotency_key"] == "idk-1"

        restored = Event.model_validate(payload)
        assert restored.id == ev.id
        assert restored.type == ev.type
        assert restored.data == ev.data

    def test_actor_on_behalf_of(self):
        actor = Actor(
            kind=ActorKind.MEMBER,
            id=7,
            on_behalf_of="cus_01H7X3Y8QK2N9M4B5V6C7D8E9F",
        )
        payload = actor.model_dump(mode="json")
        assert payload["on_behalf_of"] == "cus_01H7X3Y8QK2N9M4B5V6C7D8E9F"

    def test_context_defaults(self):
        ctx = EventContext()
        assert ctx.trigger_event_id is None
        assert ctx.causation_depth == 0
