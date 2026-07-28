"""Unit tests para los DTOs Pydantic del módulo wallet."""
from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.modules.wallet import (
    BalanceType,
    CreditRequest,
    DebitRequest,
    LedgerCause,
    VoucherIn,
)


class TestCreditRequest:
    def test_valid(self):
        req = CreditRequest(balance_type=BalanceType.POINTS, amount=100)
        assert req.amount == Decimal(100)
        assert req.cause is LedgerCause.MANUAL_ADJUST

    def test_amount_zero_rejected(self):
        with pytest.raises(ValidationError):
            CreditRequest(balance_type=BalanceType.POINTS, amount=0)

    def test_amount_negative_rejected(self):
        with pytest.raises(ValidationError):
            CreditRequest(balance_type=BalanceType.POINTS, amount=-1)

    def test_amount_coerced_from_string(self):
        req = CreditRequest(balance_type=BalanceType.CASHBACK_COP, amount="1250.75")
        assert req.amount == Decimal("1250.75")

    def test_cause_ref_length(self):
        with pytest.raises(ValidationError):
            CreditRequest(
                balance_type=BalanceType.POINTS,
                amount=10,
                cause_ref="x" * 81,
            )


class TestDebitRequest:
    def test_valid_default_no_negative(self):
        req = DebitRequest(balance_type=BalanceType.POINTS, amount=50)
        assert req.allow_negative is False

    def test_allow_negative_opt_in(self):
        req = DebitRequest(
            balance_type=BalanceType.POINTS, amount=50, allow_negative=True,
        )
        assert req.allow_negative is True


class TestVoucherIn:
    def test_valid_minimal(self):
        v = VoucherIn(code="ABC123", title="10% descuento")
        assert v.origin == "manual"
        assert v.conditions_snapshot == {}

    def test_code_too_short(self):
        with pytest.raises(ValidationError):
            VoucherIn(code="AB", title="x")

    def test_code_too_long(self):
        with pytest.raises(ValidationError):
            VoucherIn(code="x" * 61, title="x")

    def test_title_required(self):
        with pytest.raises(ValidationError):
            VoucherIn(code="ABC123", title="")
