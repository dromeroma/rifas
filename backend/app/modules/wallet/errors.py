"""Excepciones del módulo wallet."""
from __future__ import annotations

from decimal import Decimal


class WalletModuleError(Exception):
    """Base para errores del módulo wallet."""


class WalletNotFoundError(WalletModuleError):
    """No hay wallet para el customer/tenant dado."""


class InsufficientBalanceError(WalletModuleError):
    """Un débito dejaría el balance en negativo.

    Contiene el balance actual y el intento — el caller puede
    presentar mensaje útil ("te falta X") en la UI.
    """

    def __init__(
        self,
        *,
        wallet_id: int,
        balance_type: str,
        available: Decimal,
        attempted: Decimal,
    ):
        self.wallet_id = wallet_id
        self.balance_type = balance_type
        self.available = available
        self.attempted = attempted
        super().__init__(
            f"balance insuficiente en wallet={wallet_id} "
            f"{balance_type}: disponible={available}, intento={attempted}"
        )


class InvalidDeltaError(WalletModuleError):
    """El delta pasado a credit/debit es inválido (cero, negativo en
    credit, positivo en debit, o no numérico)."""


class VoucherNotFoundError(WalletModuleError):
    """No existe voucher con ese id/código en el tenant."""


class VoucherStateError(WalletModuleError):
    """Transición de estado inválida en un voucher.

    Los estados son monotónicos: `active` puede pasar a
    `redeemed|expired|revoked`, pero desde esos terminales no se
    vuelve.
    """

    def __init__(self, *, voucher_id: int, current: str, attempted: str):
        self.voucher_id = voucher_id
        self.current = current
        self.attempted = attempted
        super().__init__(
            f"voucher #{voucher_id} está {current!r} — no se puede "
            f"pasar a {attempted!r}"
        )


class DuplicateVoucherCodeError(WalletModuleError):
    """El code que se intenta emitir ya existe para el tenant."""

    def __init__(self, *, tenant_id: int, code: str):
        self.tenant_id = tenant_id
        self.code = code
        super().__init__(
            f"code {code!r} ya existe para tenant {tenant_id}"
        )
