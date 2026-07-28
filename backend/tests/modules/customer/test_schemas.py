"""Unit tests para los DTOs Pydantic del módulo customer."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.modules.customer import (
    ConsentAction,
    ConsentIn,
    IdentifyRequest,
    IdentityIn,
    IdentityKind,
    NotificationChannel,
    PreferenceIn,
)


class TestIdentityIn:
    def test_valid(self):
        payload = IdentityIn(kind=IdentityKind.EMAIL, value="ana@mail.com")
        assert payload.value == "ana@mail.com"

    def test_empty_value_rejected(self):
        with pytest.raises(ValidationError):
            IdentityIn(kind=IdentityKind.EMAIL, value="")

    def test_string_kind_coerced(self):
        # Pydantic coerce string a enum.
        payload = IdentityIn(kind="email", value="a@b.co")  # type: ignore[arg-type]
        assert payload.kind is IdentityKind.EMAIL

    def test_unknown_kind_rejected(self):
        with pytest.raises(ValidationError):
            IdentityIn(kind="not_a_kind", value="x")  # type: ignore[arg-type]


class TestPreferenceIn:
    def test_defaults(self):
        p = PreferenceIn(channel=NotificationChannel.WHATSAPP)
        assert p.allowed is True
        assert p.settings == {}

    def test_settings_free_form(self):
        p = PreferenceIn(
            channel=NotificationChannel.EMAIL,
            allowed=False,
            settings={"reason": "user_optout"},
        )
        assert p.settings == {"reason": "user_optout"}


class TestConsentIn:
    def test_minimal(self):
        c = ConsentIn(purpose="marketing", source="landing_form")
        assert c.action is ConsentAction.GRANTED   # default

    def test_purpose_required(self):
        with pytest.raises(ValidationError):
            ConsentIn(purpose="", source="landing_form")

    def test_source_required(self):
        with pytest.raises(ValidationError):
            ConsentIn(purpose="marketing", source="")

    def test_policy_version_optional(self):
        c = ConsentIn(purpose="marketing", source="ui", policy_version="2026-Q3")
        assert c.policy_version == "2026-Q3"


class TestIdentifyRequest:
    def test_minimal_valid(self):
        req = IdentifyRequest(
            identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
        )
        assert req.identity.value == "a@b.co"
        assert req.additional_identities == []
        assert req.full_name is None

    def test_with_additional_identities(self):
        req = IdentifyRequest(
            identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            full_name="Ana Pérez",
            additional_identities=[
                IdentityIn(kind=IdentityKind.PHONE, value="+57300..."),
                IdentityIn(kind=IdentityKind.DOCUMENT, value="12345"),
            ],
            source="checkout",
        )
        assert len(req.additional_identities) == 2

    def test_full_name_max_length(self):
        with pytest.raises(ValidationError):
            IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
                full_name="x" * 151,
            )
