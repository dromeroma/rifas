"""Unit tests del módulo notifications.

Cubre: templating renderer + provider registry. Sin BD.
"""
from __future__ import annotations

import pytest

from app.modules.notifications.errors import ProviderNotConfiguredError
from app.modules.notifications.models import NotificationChannel
from app.modules.notifications.providers.registry import provider_registry
from app.modules.notifications.templating import build_context, render


class TestRenderer:
    def test_none_template_returns_empty(self):
        assert render(None, {}) == ""

    def test_empty_template_returns_empty(self):
        assert render("", {"customer": {"full_name": "Ana"}}) == ""

    def test_simple_placeholder(self):
        assert (
            render("Hola {{customer.full_name}}", {"customer": {"full_name": "Ana"}})
            == "Hola Ana"
        )

    def test_multiple_placeholders(self):
        result = render(
            "{{customer.full_name}} ganó {{data.points}} pts",
            {"customer": {"full_name": "Ana"}, "data": {"points": 50}},
        )
        assert result == "Ana ganó 50 pts"

    def test_whitespace_inside_placeholder(self):
        assert (
            render("Hola {{ customer.full_name }}", {"customer": {"full_name": "Ana"}})
            == "Hola Ana"
        )

    def test_missing_path_becomes_empty(self, caplog):
        result = render("Hola {{customer.nope}}", {"customer": {}})
        assert result == "Hola "
        assert any("no resuelto" in r.message for r in caplog.records)

    def test_nested_path(self):
        result = render(
            "{{a.b.c}}",
            {"a": {"b": {"c": "deep"}}},
        )
        assert result == "deep"

    def test_numeric_value_stringified(self):
        assert render("{{n}}", {"n": 42}) == "42"

    def test_boolean_value_stringified(self):
        assert render("{{flag}}", {"flag": True}) == "True"


class TestBuildContext:
    def test_defaults_include_now(self):
        ctx = build_context()
        assert "now" in ctx
        assert "day_of_week" in ctx["now"]
        assert ctx["customer"] == {}
        assert ctx["data"] == {}

    def test_all_fields(self):
        ctx = build_context(
            customer={"full_name": "Ana"},
            event_data={"amount": 100},
            event_type="pos.sale.completed",
            wallet={"points": 500},
            tenant={"slug": "acme"},
            extra={"meta": {"custom": 1}},
        )
        assert ctx["customer"]["full_name"] == "Ana"
        assert ctx["data"]["amount"] == 100
        assert ctx["event"]["type"] == "pos.sale.completed"
        assert ctx["wallet"]["points"] == 500
        assert ctx["tenant"]["slug"] == "acme"
        assert ctx["meta"]["custom"] == 1


class TestProviderRegistry:
    def test_bundled_providers_registered(self):
        # Al importar app.modules.notifications, los tres bundled quedan vivos.
        import app.modules.notifications  # noqa: F401
        for ch in (
            NotificationChannel.IN_APP,
            NotificationChannel.EMAIL,
            NotificationChannel.WEBHOOK,
        ):
            assert provider_registry.is_configured(ch), f"{ch.value} debería estar"

    def test_sms_not_configured_raises(self):
        import app.modules.notifications  # noqa: F401
        assert not provider_registry.is_configured(NotificationChannel.SMS)
        with pytest.raises(ProviderNotConfiguredError):
            provider_registry.get(NotificationChannel.SMS)


class TestActionRegistered:
    def test_notifications_send_registered(self):
        # Importar el módulo notifications registra la action en rules.
        import app.modules.notifications  # noqa: F401
        from app.modules.rules import action_registry
        assert action_registry.is_known("notifications.send")
