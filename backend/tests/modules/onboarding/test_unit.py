"""Unit tests del módulo onboarding — sin BD."""
from __future__ import annotations

from app.modules.onboarding import DEFAULT_STEPS
from app.modules.onboarding.steps import DEFAULT_STEPS_BY_KEY


class TestDefaultSteps:
    def test_keys_are_unique(self):
        keys = [s.key for s in DEFAULT_STEPS]
        assert len(keys) == len(set(keys))

    def test_expected_keys_present(self):
        keys = {s.key for s in DEFAULT_STEPS}
        assert {
            "brand_setup",
            "first_customer",
            "first_rule",
            "first_rule_fired",
            "first_notification",
            "go_live",
        } <= keys

    def test_go_live_subscribes_to_tenant_activated(self):
        step = DEFAULT_STEPS_BY_KEY["go_live"]
        assert "tenant.activated" in step.auto_events

    def test_first_notification_subscribes_to_message_sent(self):
        step = DEFAULT_STEPS_BY_KEY["first_notification"]
        assert "notifications.message.sent" in step.auto_events

    def test_first_rule_fired_is_optional(self):
        step = DEFAULT_STEPS_BY_KEY["first_rule_fired"]
        assert step.required is False


class TestHandlersRegistered:
    def test_all_expected_handlers_visible(self):
        """Al importar onboarding, los 6 handlers quedan vivos en el bus."""
        import app.modules.onboarding  # noqa: F401 side effect
        from app.modules.platform.events.bus import registry

        expected = {
            ("customer.identified", "onboarding.first_customer_on_identified"),
            ("rules.rule.published", "onboarding.first_rule_on_published"),
            ("rules.rule.fired", "onboarding.first_rule_fired_on_fired"),
            (
                "notifications.message.sent",
                "onboarding.first_notification_on_sent",
            ),
            (
                "tenant.profile.updated",
                "onboarding.brand_setup_on_profile_updated",
            ),
            ("tenant.activated", "onboarding.go_live_on_activated"),
        }
        for event_type, handler_id in expected:
            ids = [hid for hid, _ in registry.handlers_for(event_type)]
            assert handler_id in ids, (
                f"handler {handler_id} debería estar suscrito a {event_type}"
            )
