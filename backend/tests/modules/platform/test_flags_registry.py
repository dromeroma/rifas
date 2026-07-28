"""Unit tests para platform.flags.registry."""
from __future__ import annotations

from datetime import date

import pytest

from app.modules.platform.flags import FlagDefinition, FlagRegistry, known_flags


class TestFlagRegistry:
    def test_register_and_get(self):
        reg = FlagRegistry()
        d = reg.register(FlagDefinition(name="x.y", description="test", default=True))
        assert reg.get("x.y") is d
        assert reg.default_for("x.y") is True

    def test_duplicate_register_raises(self):
        reg = FlagRegistry()
        reg.register(FlagDefinition(name="x.y", description="a"))
        with pytest.raises(ValueError):
            reg.register(FlagDefinition(name="x.y", description="b"))

    def test_unknown_default_is_false(self):
        reg = FlagRegistry()
        assert reg.default_for("never.declared") is False
        assert reg.get("never.declared") is None

    def test_all_returns_sorted(self):
        reg = FlagRegistry()
        reg.register(FlagDefinition(name="z.a", description="z"))
        reg.register(FlagDefinition(name="a.a", description="a"))
        reg.register(FlagDefinition(name="m.a", description="m"))
        assert [d.name for d in reg.all()] == ["a.a", "m.a", "z.a"]

    def test_expires_on_metadata(self):
        d = FlagDefinition(
            name="a.b",
            description="c",
            expires_on=date(2027, 1, 1),
            owner="dev",
            related_adr="ADR-999",
        )
        assert d.expires_on == date(2027, 1, 1)
        assert d.owner == "dev"
        assert d.related_adr == "ADR-999"


class TestGlobalKnownFlags:
    def test_dispatcher_flag_registered(self):
        d = known_flags.get("platform.event_dispatcher")
        assert d is not None
        assert d.default is False  # crítico: dispatcher OFF por default
        assert d.related_adr == "ADR-002"
