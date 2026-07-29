"""Unit tests del módulo audit — sin BD."""
from __future__ import annotations

from datetime import datetime, timezone

from app.modules.audit.handlers import (
    _sanitize_changes,
    _severity_for,
    _should_capture,
)
from app.modules.audit.models import AuditSeverity
from app.modules.platform.events import (
    Actor,
    ActorKind,
    Event,
    Subject,
)


def _make_event(
    event_type: str,
    actor_kind: ActorKind = ActorKind.MEMBER,
    data: dict | None = None,
) -> Event:
    return Event(
        type=event_type,
        tenant_id=1,
        actor=Actor(kind=actor_kind, id=1),
        subject=Subject(kind="tenant_profile", id=1),
        data=data or {},
    )


class TestShouldCapture:
    def test_member_actor_always_captured(self):
        evt = _make_event("customer.identified", ActorKind.MEMBER)
        assert _should_capture(evt) is True

    def test_system_captured_only_for_whitelist(self):
        good = _make_event("tenant.activated", ActorKind.SYSTEM)
        bad = _make_event("customer.identified", ActorKind.SYSTEM)
        assert _should_capture(good) is True
        assert _should_capture(bad) is False

    def test_audit_events_never_captured(self):
        evt = _make_event("audit.entry.recorded", ActorKind.MEMBER)
        assert _should_capture(evt) is False

    def test_platform_events_never_captured(self):
        evt = _make_event("platform.dispatcher.started", ActorKind.MEMBER)
        assert _should_capture(evt) is False

    def test_rule_actor_not_captured(self):
        evt = _make_event("wallet.points.credited", ActorKind.RULE)
        assert _should_capture(evt) is False


class TestSeverityFor:
    def test_error_events_are_warn(self):
        evt = _make_event("rules.rule.errored", ActorKind.SYSTEM)
        assert _severity_for(evt) is AuditSeverity.WARN

    def test_tenant_activated_is_notice(self):
        evt = _make_event("tenant.activated", ActorKind.SYSTEM)
        assert _severity_for(evt) is AuditSeverity.NOTICE

    def test_config_change_by_member_is_notice(self):
        evt = _make_event("rules.rule.published", ActorKind.MEMBER)
        assert _severity_for(evt) is AuditSeverity.NOTICE

    def test_default_is_info(self):
        evt = _make_event("customer.identified", ActorKind.MEMBER)
        assert _severity_for(evt) is AuditSeverity.INFO


class TestSanitizeChanges:
    def test_removes_rendered_body_of_notifications(self):
        evt = _make_event(
            "notifications.message.sent",
            data={
                "rendered_body": "Hola Juan, tu clave es 1234",
                "rendered_subject": "Password",
                "channel": "email",
            },
        )
        clean = _sanitize_changes(evt)
        assert "rendered_body" not in clean
        assert "rendered_subject" not in clean
        assert clean["channel"] == "email"

    def test_masks_secret_keys(self):
        evt = _make_event(
            "tenant.profile.updated",
            data={
                "api_key": "sk_live_secret",
                "webhook_token": "abc123",
                "brand_name": "Foo",
            },
        )
        clean = _sanitize_changes(evt)
        assert clean["api_key"] == "***"
        assert clean["webhook_token"] == "***"
        assert clean["brand_name"] == "Foo"


class TestHandlerRegistered:
    def test_wildcard_handler_visible(self):
        import app.modules.audit  # noqa: F401 side effect
        from app.modules.platform.events.bus import registry

        wildcard_ids = [hid for hid, _ in registry.handlers_for("*")]
        assert "audit.record_on_any_event" in wildcard_ids
