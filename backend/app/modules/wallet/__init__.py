"""wallet — segundo pilar del dominio de Savvy Perks.

Contenedor de valor por (customer, tenant). Guarda balances de N
tipos, ledger append-only y vouchers activos.

Superficie pública:

  Modelos:
    Wallet, WalletBalance, WalletLedger, Voucher
    BalanceType, LedgerCause, VoucherState

  Errores:
    WalletModuleError, WalletNotFoundError, InsufficientBalanceError,
    InvalidDeltaError, VoucherNotFoundError, VoucherStateError,
    DuplicateVoucherCodeError

  DTOs:
    CreditRequest, DebitRequest, VoucherIn
    BalanceOut, LedgerEntryOut, VoucherOut, WalletSnapshot

  Service:
    find_or_create, find, get_by_id
    get_balance, list_balances, snapshot
    credit, debit
    issue_voucher, redeem_voucher, expire_voucher, revoke_voucher
    find_voucher, get_voucher, list_active_vouchers

  Handlers:
    wallet.handlers registra suscripciones al bus (customer.identified
    → create wallet).

Ver docs/06-REWARDS_ENGINE.md (sección Wallet).
"""
from app.modules.wallet import events, handlers  # noqa: F401 — registra handlers
from app.modules.wallet.errors import (
    DuplicateVoucherCodeError,
    InsufficientBalanceError,
    InvalidDeltaError,
    VoucherNotFoundError,
    VoucherStateError,
    WalletModuleError,
    WalletNotFoundError,
)
from app.modules.wallet.models import (
    BalanceType,
    LedgerCause,
    Voucher,
    VoucherState,
    Wallet,
    WalletBalance,
    WalletLedger,
)
from app.modules.wallet.schemas import (
    BalanceOut,
    CreditRequest,
    DebitRequest,
    LedgerEntryOut,
    VoucherIn,
    VoucherOut,
    WalletSnapshot,
)
from app.modules.wallet.service import (
    credit,
    debit,
    expire_voucher,
    find,
    find_or_create,
    find_voucher,
    get_balance,
    get_by_id,
    get_voucher,
    issue_voucher,
    list_active_vouchers,
    list_balances,
    redeem_voucher,
    revoke_voucher,
    snapshot,
)

__all__ = [
    "BalanceOut",
    "BalanceType",
    "CreditRequest",
    "DebitRequest",
    "DuplicateVoucherCodeError",
    "InsufficientBalanceError",
    "InvalidDeltaError",
    "LedgerCause",
    "LedgerEntryOut",
    "Voucher",
    "VoucherIn",
    "VoucherNotFoundError",
    "VoucherOut",
    "VoucherState",
    "VoucherStateError",
    "Wallet",
    "WalletBalance",
    "WalletLedger",
    "WalletModuleError",
    "WalletNotFoundError",
    "WalletSnapshot",
    "credit",
    "debit",
    "events",
    "expire_voucher",
    "find",
    "find_or_create",
    "find_voucher",
    "get_balance",
    "get_by_id",
    "get_voucher",
    "issue_voucher",
    "list_active_vouchers",
    "list_balances",
    "redeem_voucher",
    "revoke_voucher",
    "snapshot",
]
