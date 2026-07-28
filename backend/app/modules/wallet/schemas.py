"""DTOs Pydantic del módulo wallet."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.wallet.models import (
    BalanceType,
    LedgerCause,
    VoucherState,
)


class BalanceOut(BaseModel):
    balance_type: BalanceType
    amount: Decimal
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LedgerEntryOut(BaseModel):
    id: int
    balance_type: BalanceType
    delta: Decimal
    balance_after: Decimal
    cause: LedgerCause
    cause_ref: str | None = None
    memo: str | None = None
    related_event_id: str | None = None
    expires_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreditRequest(BaseModel):
    """Payload para credit()."""

    balance_type: BalanceType
    amount: Decimal = Field(gt=Decimal(0))
    cause: LedgerCause = LedgerCause.MANUAL_ADJUST
    cause_ref: str | None = Field(default=None, max_length=80)
    memo: str | None = None
    expires_at: datetime | None = None

    @field_validator("amount", mode="before")
    @classmethod
    def _coerce_decimal(cls, v: Any) -> Any:
        if isinstance(v, (int, float, str)):
            return Decimal(str(v))
        return v


class DebitRequest(BaseModel):
    """Payload para debit()."""

    balance_type: BalanceType
    amount: Decimal = Field(gt=Decimal(0))
    cause: LedgerCause = LedgerCause.MANUAL_ADJUST
    cause_ref: str | None = Field(default=None, max_length=80)
    memo: str | None = None
    allow_negative: bool = False

    @field_validator("amount", mode="before")
    @classmethod
    def _coerce_decimal(cls, v: Any) -> Any:
        if isinstance(v, (int, float, str)):
            return Decimal(str(v))
        return v


class WalletSnapshot(BaseModel):
    """Vista rica del estado actual de una wallet."""

    id: int
    tenant_id: int
    customer_id: int
    balances: list[BalanceOut] = Field(default_factory=list)
    active_vouchers: int = 0

    model_config = ConfigDict(from_attributes=True)


class VoucherIn(BaseModel):
    """Payload de emisión de voucher."""

    code: str = Field(min_length=3, max_length=60)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    conditions_snapshot: dict[str, Any] = Field(default_factory=dict)
    origin: str = Field(default="manual", max_length=40)
    origin_ref: str | None = Field(default=None, max_length=80)
    expires_at: datetime | None = None


class VoucherOut(BaseModel):
    id: int
    tenant_id: int
    wallet_id: int
    customer_id: int
    code: str
    title: str
    description: str | None = None
    state: VoucherState
    origin: str
    origin_ref: str | None = None
    issued_at: datetime
    expires_at: datetime | None = None
    redeemed_at: datetime | None = None
    revoked_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
