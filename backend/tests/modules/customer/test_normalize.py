"""Unit tests para la normalización de identities.

No requieren BD. Prueban _normalize_identity y las reglas por kind.
"""
from __future__ import annotations

import pytest

from app.modules.customer import IdentityKind, InvalidIdentityValueError
from app.modules.customer.service import _normalize_identity


class TestEmailNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Ana@Mail.com", "ana@mail.com"),
            ("  UPPER@Domain.CO  ", "upper@domain.co"),
            ("mixed.CASE+tag@example.io", "mixed.case+tag@example.io"),
        ],
    )
    def test_valid_lowercased_and_trimmed(self, raw, expected):
        assert _normalize_identity(IdentityKind.EMAIL, raw) == expected

    @pytest.mark.parametrize(
        "bad",
        ["", " ", "no-at-sign", "missing@dot", "@nohandle.co", "  @  ", "a@b"],
    )
    def test_invalid_rejected(self, bad):
        with pytest.raises(InvalidIdentityValueError):
            _normalize_identity(IdentityKind.EMAIL, bad)


class TestPhoneNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("+57 300 111 2222", "573001112222"),
            ("300-111-2222", "3001112222"),
            (" (57) 300.111.2222 ", "573001112222"),
            ("3011234567", "3011234567"),
        ],
    )
    def test_digits_only(self, raw, expected):
        assert _normalize_identity(IdentityKind.PHONE, raw) == expected

    @pytest.mark.parametrize("bad", ["", "abc", "12345", "   -   "])
    def test_too_few_digits_rejected(self, bad):
        with pytest.raises(InvalidIdentityValueError):
            _normalize_identity(IdentityKind.PHONE, bad)


class TestDocumentNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("12.345.678", "12345678"),
            ("cc 1234", "CC1234"),   # espacios eliminados; upper
            ("A-1-B", "A1B"),
        ],
    )
    def test_strips_separators_and_uppercases(self, raw, expected):
        assert _normalize_identity(IdentityKind.DOCUMENT, raw) == expected

    def test_empty_rejected(self):
        with pytest.raises(InvalidIdentityValueError):
            _normalize_identity(IdentityKind.DOCUMENT, "   ")


class TestExternalNormalization:
    def test_preserves_case_and_content(self):
        assert (
            _normalize_identity(IdentityKind.EXTERNAL, "shopify_abc-123")
            == "shopify_abc-123"
        )

    def test_trims_whitespace(self):
        assert (
            _normalize_identity(IdentityKind.EXTERNAL, "  ext_1  ")
            == "ext_1"
        )

    def test_empty_rejected(self):
        with pytest.raises(InvalidIdentityValueError):
            _normalize_identity(IdentityKind.EXTERNAL, "  ")
