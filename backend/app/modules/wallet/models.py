"""Modelos ORM del módulo wallet.

Cuatro tablas nuevas (aditivas, cero contacto con tablas legacy):

  wallets           · una por (customer_id, tenant_id). Raíz del agregado.
  wallet_balances   · N balances por wallet (uno por balance_type).
                      Denormalizado desde el ledger para queries O(1).
  wallet_ledger     · append-only. Fuente de verdad de todos los deltas.
                      Cada fila incluye balance_after (snapshot post-op).
  wallet_vouchers   · cupones vivientes (issued/redeemed/expired/revoked).

Invariantes clave (enforced en service):
  - balance nunca negativo por tipo (salvo overdraft explícito futuro).
  - toda mutación de balance pasa por el ledger — nunca UPDATE directo.
  - un voucher_code es único por tenant.
  - transiciones de estado del voucher son monotónicas (active →
    redeemed|expired|revoked; nunca revierten).
"""
from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# ────────────────────────────────────────────────────────────────
# Catálogos (enums)
# ────────────────────────────────────────────────────────────────


class BalanceType(str, enum.Enum):
    """Tipos de balance soportados por wallet.

    Extensible sin migración (native_enum=False → columna VARCHAR).
    Un tenant puede usar solo un subconjunto; el catálogo real por
    tenant se documenta en su config y se enforce a nivel de servicio
    en fases posteriores.
    """

    POINTS = "points"                 # entero, canjeable
    XP = "xp"                         # entero, NO canjeable (gamificación)
    CASHBACK_COP = "cashback_cop"     # decimal, moneda COP
    CREDIT_SECONDS = "credit_seconds" # entero (ISP, streaming)
    VISITS = "visits"                 # entero
    STAMPS = "stamps"                 # entero (tarjeta de café)


class LedgerCause(str, enum.Enum):
    """Origen de una entrada del ledger — para trazabilidad."""

    RULE = "rule"
    CAMPAIGN = "campaign"
    REDEMPTION = "redemption"
    MANUAL_ADJUST = "manual_adjust"
    EXPIRATION = "expiration"
    REFUND = "refund"
    SIGNUP_BONUS = "signup_bonus"
    IMPORT = "import"
    UNKNOWN = "unknown"


class VoucherState(str, enum.Enum):
    """Ciclo de vida de un voucher."""

    ACTIVE = "active"       # emitido y utilizable
    REDEEMED = "redeemed"   # canjeado por el customer
    EXPIRED = "expired"     # venció sin canjearse
    REVOKED = "revoked"     # admin lo anuló


# ────────────────────────────────────────────────────────────────
# Wallet — raíz del agregado
# ────────────────────────────────────────────────────────────────


class Wallet(Base):
    """Contenedor de valor por (customer, tenant).

    Una wallet agrupa: balances de N tipos, historia del ledger,
    vouchers activos y estado gamificado. Otros módulos accederán a la
    wallet a través del service — nunca escribiendo balances directo.
    """

    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Metadata libre — tags, notas, config por wallet.
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "customer_id", name="uq_wallet_tenant_customer",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Wallet id={self.id} tenant={self.tenant_id} "
            f"customer={self.customer_id}>"
        )


# ────────────────────────────────────────────────────────────────
# WalletBalance — snapshot por tipo
# ────────────────────────────────────────────────────────────────


class WalletBalance(Base):
    """Snapshot del balance actual por (wallet, balance_type).

    Se actualiza junto con cada asiento en el ledger. Lecturas rápidas
    sin necesidad de recorrer el ledger histórico. La fuente de verdad
    sigue siendo el ledger — este snapshot puede reconciliarse.
    """

    __tablename__ = "wallet_balances"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    balance_type: Mapped[BalanceType] = mapped_column(
        SAEnum(
            BalanceType, name="wallet_balance_type",
            native_enum=False, length=40,
        ),
        nullable=False,
    )

    # Numeric(18,4) da margen para todos los tipos (entero grande o
    # decimal fino como cashback_cop).
    amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), nullable=False, default=Decimal(0),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "wallet_id", "balance_type", name="uq_wallet_balance_type",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<WalletBalance wallet={self.wallet_id} "
            f"{self.balance_type.value}={self.amount}>"
        )


# ────────────────────────────────────────────────────────────────
# WalletLedger — append-only
# ────────────────────────────────────────────────────────────────


class WalletLedger(Base):
    """Historia inmutable de mutaciones de balance.

    Cada fila representa un delta (positivo o negativo) sobre un
    balance específico. Ninguna fila se edita ni se elimina —
    correcciones se hacen con nuevas filas de compensación.
    """

    __tablename__ = "wallet_ledger"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    balance_type: Mapped[BalanceType] = mapped_column(
        SAEnum(
            BalanceType, name="wallet_balance_type",
            native_enum=False, length=40,
        ),
        nullable=False,
    )

    delta: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)

    cause: Mapped[LedgerCause] = mapped_column(
        SAEnum(
            LedgerCause, name="wallet_ledger_cause",
            native_enum=False, length=40,
        ),
        nullable=False,
    )
    # Id del recurso que causó la mutación (regla, campaña, redención,
    # ajuste manual). Sin FK — apunta a distintos módulos.
    cause_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Correlación con el evento que originó la mutación (trazabilidad
    # con el event bus).
    related_event_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True, index=True,
    )

    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cuando aplica: expiración del lote de puntos (para expirations
    # posteriores). Nulo para deltas negativos o tipos sin expiración.
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    __table_args__ = (
        # Query típica: "traeme el historial de este wallet por tipo".
        Index(
            "ix_wallet_ledger_wallet_type_id",
            "wallet_id", "balance_type", "id",
        ),
        # Para búsqueda inversa desde un evento.
        Index("ix_wallet_ledger_related_event", "related_event_id"),
    )

    def __repr__(self) -> str:
        sign = "+" if self.delta >= 0 else ""
        return (
            f"<WalletLedger #{self.id} wallet={self.wallet_id} "
            f"{self.balance_type.value} {sign}{self.delta} "
            f"→ {self.balance_after} ({self.cause.value})>"
        )


# ────────────────────────────────────────────────────────────────
# Voucher — cupón
# ────────────────────────────────────────────────────────────────


class Voucher(Base):
    """Cupón viviente en la wallet.

    En Fase 1 el voucher es standalone (no referencia una Reward
    todavía — el módulo Rewards llega en Sprint 5). El código es único
    por tenant. Estados son monotónicos.
    """

    __tablename__ = "wallet_vouchers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    wallet_id: Mapped[int] = mapped_column(
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Código legible que el customer usa para canjear. Único por tenant.
    code: Mapped[str] = mapped_column(String(60), nullable=False)

    # Título y descripción libres — se copian desde la Reward al
    # emitir para congelar wording. En Fase 1 vienen del caller directo.
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot de reglas de canje (monto de descuento, aplicabilidad,
    # etc.) — congelado para inmunizar contra cambios del catálogo.
    conditions_snapshot: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict,
    )

    state: Mapped[VoucherState] = mapped_column(
        SAEnum(
            VoucherState, name="wallet_voucher_state",
            native_enum=False, length=20,
        ),
        nullable=False,
        default=VoucherState.ACTIVE,
        index=True,
    )

    # Origen del voucher (regla, campaña, canje, emisión manual).
    origin: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    origin_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)

    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    redeemed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "code", name="uq_wallet_voucher_tenant_code",
        ),
        # Query típica: "vouchers activos del customer".
        Index(
            "ix_wallet_voucher_customer_state",
            "customer_id", "state", "expires_at",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Voucher {self.code!r} state={self.state.value} "
            f"wallet={self.wallet_id}>"
        )
