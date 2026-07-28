"""Service del módulo wallet — reglas del dominio.

Superficie pública:

  find_or_create(db, tenant_id, customer_id, actor) -> Wallet
      Idempotente: si ya existe wallet para el customer, la devuelve.
      Si no, la crea + emite `wallet.created`.

  get_balance(db, wallet_id, balance_type) -> Decimal
      Snapshot rápido desde wallet_balances.

  snapshot(db, wallet_id) -> WalletSnapshot
      Vista rica: balances + conteo de vouchers activos.

  credit(db, wallet_id, actor, request) -> WalletLedger
      Aditivo. Actualiza balance + registra ledger + emite evento.

  debit(db, wallet_id, actor, request) -> WalletLedger
      Sustractivo. Valida saldo (o permite negativo si allow_negative).
      Registra ledger + emite evento.

  issue_voucher(db, wallet_id, actor, request) -> Voucher
  redeem_voucher(db, tenant_id, code, actor) -> Voucher
  expire_voucher(db, voucher_id) -> Voucher
  revoke_voucher(db, voucher_id, actor) -> Voucher

Invariantes enforced:
  - Balance nunca negativo salvo `allow_negative=True`.
  - Todas las mutaciones pasan por ledger + snapshot atómicamente.
  - Vouchers: transiciones monotónicas active → redeemed|expired|revoked.
  - Voucher code único por tenant.

Ninguna función hace commit — el llamante decide cuándo persistir.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from app.modules.platform.events import (
    Actor,
    Event,
    EventContext,
    Subject,
    publish,
)
from app.modules.wallet.errors import (
    DuplicateVoucherCodeError,
    InsufficientBalanceError,
    InvalidDeltaError,
    VoucherNotFoundError,
    VoucherStateError,
    WalletNotFoundError,
)
from app.modules.wallet.events import (
    WALLET_CREATED,
    WALLET_POINTS_CREDITED,
    WALLET_POINTS_DEBITED,
    WALLET_POINTS_EXPIRED,
    WALLET_VOUCHER_EXPIRED,
    WALLET_VOUCHER_ISSUED,
    WALLET_VOUCHER_REDEEMED,
    WALLET_VOUCHER_REVOKED,
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
    VoucherIn,
    WalletSnapshot,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ────────────────────────────────────────────────────────────────
# Wallet lifecycle
# ────────────────────────────────────────────────────────────────


async def find(
    db: "AsyncSession", *, tenant_id: int, customer_id: int,
) -> Wallet | None:
    """Devuelve la wallet si existe, None en caso contrario."""
    stmt = select(Wallet).where(
        Wallet.tenant_id == tenant_id,
        Wallet.customer_id == customer_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_by_id(
    db: "AsyncSession", *, wallet_id: int,
) -> Wallet:
    """Devuelve la wallet o levanta WalletNotFoundError."""
    wallet = await db.get(Wallet, wallet_id)
    if wallet is None:
        raise WalletNotFoundError(f"wallet #{wallet_id} no existe")
    return wallet


async def find_or_create(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
    actor: Actor,
    trigger_event_id: str | None = None,
) -> Wallet:
    """Idempotente. Emite `wallet.created` solo la primera vez.

    Usa INSERT ... ON CONFLICT DO NOTHING para blindarse contra
    concurrencia (dos identify() simultáneos sobre el mismo customer).
    """
    # Camino feliz: ya existe.
    existing = await find(db, tenant_id=tenant_id, customer_id=customer_id)
    if existing is not None:
        return existing

    stmt = (
        pg_insert(Wallet)
        .values(tenant_id=tenant_id, customer_id=customer_id, metadata={})
        .on_conflict_do_nothing(
            index_elements=["tenant_id", "customer_id"],
        )
        .returning(Wallet)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    if row is None:
        # Carrera perdida — otro caller ya la creó justo antes.
        # Re-buscamos y devolvemos sin emitir evento.
        wallet = await find(db, tenant_id=tenant_id, customer_id=customer_id)
        if wallet is None:
            raise WalletModuleError(  # type: ignore[name-defined]
                "carrera imposible: on_conflict_do_nothing no devolvió fila "
                "pero la wallet no existe"
            )
        return wallet

    await publish(
        Event(
            type=WALLET_CREATED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="wallet", id=row.id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={"customer_id": customer_id},
        ),
        db,
    )
    return row


# ────────────────────────────────────────────────────────────────
# Balances (snapshot)
# ────────────────────────────────────────────────────────────────


async def _get_or_init_balance(
    db: "AsyncSession",
    *,
    tenant_id: int,
    wallet_id: int,
    balance_type: BalanceType,
) -> WalletBalance:
    """Devuelve la fila de balance, creándola con amount=0 si no existía.

    Usa un lock optimista (SELECT FOR UPDATE) para evitar races entre
    dos credits/debits concurrentes.
    """
    stmt = (
        select(WalletBalance)
        .where(
            WalletBalance.wallet_id == wallet_id,
            WalletBalance.balance_type == balance_type,
        )
        .with_for_update()
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is not None:
        return row

    row = WalletBalance(
        tenant_id=tenant_id,
        wallet_id=wallet_id,
        balance_type=balance_type,
        amount=Decimal(0),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        # Otro caller creó la fila entre el SELECT y el INSERT — recargamos.
        await db.rollback()
        row = (
            await db.execute(
                select(WalletBalance)
                .where(
                    WalletBalance.wallet_id == wallet_id,
                    WalletBalance.balance_type == balance_type,
                )
                .with_for_update()
            )
        ).scalar_one()
    return row


async def get_balance(
    db: "AsyncSession",
    *,
    wallet_id: int,
    balance_type: BalanceType,
) -> Decimal:
    """Snapshot del balance. Cero si la wallet nunca tuvo ese tipo."""
    stmt = select(WalletBalance.amount).where(
        WalletBalance.wallet_id == wallet_id,
        WalletBalance.balance_type == balance_type,
    )
    amount = (await db.execute(stmt)).scalar_one_or_none()
    return amount if amount is not None else Decimal(0)


async def list_balances(
    db: "AsyncSession", *, wallet_id: int,
) -> list[WalletBalance]:
    stmt = (
        select(WalletBalance)
        .where(WalletBalance.wallet_id == wallet_id)
        .order_by(WalletBalance.balance_type.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def snapshot(
    db: "AsyncSession", *, wallet_id: int,
) -> WalletSnapshot:
    wallet = await get_by_id(db, wallet_id=wallet_id)
    balances = await list_balances(db, wallet_id=wallet_id)

    active = (
        await db.execute(
            select(Voucher).where(
                Voucher.wallet_id == wallet_id,
                Voucher.state == VoucherState.ACTIVE,
            )
        )
    ).scalars().all()

    return WalletSnapshot(
        id=wallet.id,
        tenant_id=wallet.tenant_id,
        customer_id=wallet.customer_id,
        balances=[BalanceOut.model_validate(b) for b in balances],
        active_vouchers=len(list(active)),
    )


# ────────────────────────────────────────────────────────────────
# Credit / Debit
# ────────────────────────────────────────────────────────────────


def _event_type_for_credit(balance_type: BalanceType) -> str:
    """Fase 1 usa el mismo type para todos los balances (points-family).
    Cuando el volumen justifique granularidad se subdivide."""
    if balance_type is BalanceType.XP:
        # xp puede tener handlers distintos — mismo type por ahora.
        return WALLET_POINTS_CREDITED
    return WALLET_POINTS_CREDITED


def _event_type_for_debit(cause: LedgerCause) -> str:
    if cause is LedgerCause.EXPIRATION:
        return WALLET_POINTS_EXPIRED
    return WALLET_POINTS_DEBITED


async def credit(
    db: "AsyncSession",
    *,
    wallet_id: int,
    actor: Actor,
    request: CreditRequest,
    trigger_event_id: str | None = None,
) -> WalletLedger:
    """Suma `request.amount` al balance del tipo dado."""
    if request.amount <= 0:
        raise InvalidDeltaError(
            f"credit requiere amount > 0, recibido {request.amount}"
        )

    wallet = await get_by_id(db, wallet_id=wallet_id)
    balance = await _get_or_init_balance(
        db,
        tenant_id=wallet.tenant_id,
        wallet_id=wallet_id,
        balance_type=request.balance_type,
    )

    balance.amount = balance.amount + request.amount
    entry = WalletLedger(
        tenant_id=wallet.tenant_id,
        wallet_id=wallet_id,
        balance_type=request.balance_type,
        delta=request.amount,
        balance_after=balance.amount,
        cause=request.cause,
        cause_ref=request.cause_ref,
        memo=request.memo,
        related_event_id=trigger_event_id,
        expires_at=request.expires_at,
    )
    db.add(entry)
    await db.flush()

    await publish(
        Event(
            type=_event_type_for_credit(request.balance_type),
            tenant_id=wallet.tenant_id,
            actor=actor,
            subject=Subject(kind="wallet", id=wallet_id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "customer_id": wallet.customer_id,
                "balance_type": request.balance_type.value,
                "delta": str(request.amount),
                "balance_after": str(balance.amount),
                "cause": request.cause.value,
                "cause_ref": request.cause_ref,
                "ledger_entry_id": entry.id,
            },
        ),
        db,
    )
    return entry


async def debit(
    db: "AsyncSession",
    *,
    wallet_id: int,
    actor: Actor,
    request: DebitRequest,
    trigger_event_id: str | None = None,
) -> WalletLedger:
    """Resta `request.amount` del balance del tipo dado.

    Levanta InsufficientBalanceError si dejaría en negativo y
    `allow_negative=False` (default). Con `allow_negative=True` acepta
    el asiento — útil para ajustes administrativos.
    """
    if request.amount <= 0:
        raise InvalidDeltaError(
            f"debit requiere amount > 0, recibido {request.amount}"
        )

    wallet = await get_by_id(db, wallet_id=wallet_id)
    balance = await _get_or_init_balance(
        db,
        tenant_id=wallet.tenant_id,
        wallet_id=wallet_id,
        balance_type=request.balance_type,
    )

    new_amount = balance.amount - request.amount
    if new_amount < 0 and not request.allow_negative:
        raise InsufficientBalanceError(
            wallet_id=wallet_id,
            balance_type=request.balance_type.value,
            available=balance.amount,
            attempted=request.amount,
        )

    balance.amount = new_amount
    entry = WalletLedger(
        tenant_id=wallet.tenant_id,
        wallet_id=wallet_id,
        balance_type=request.balance_type,
        delta=-request.amount,
        balance_after=balance.amount,
        cause=request.cause,
        cause_ref=request.cause_ref,
        memo=request.memo,
        related_event_id=trigger_event_id,
    )
    db.add(entry)
    await db.flush()

    await publish(
        Event(
            type=_event_type_for_debit(request.cause),
            tenant_id=wallet.tenant_id,
            actor=actor,
            subject=Subject(kind="wallet", id=wallet_id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "customer_id": wallet.customer_id,
                "balance_type": request.balance_type.value,
                "delta": str(-request.amount),
                "balance_after": str(balance.amount),
                "cause": request.cause.value,
                "cause_ref": request.cause_ref,
                "ledger_entry_id": entry.id,
            },
        ),
        db,
    )
    return entry


# ────────────────────────────────────────────────────────────────
# Vouchers
# ────────────────────────────────────────────────────────────────


async def find_voucher(
    db: "AsyncSession", *, tenant_id: int, code: str,
) -> Voucher | None:
    stmt = select(Voucher).where(
        Voucher.tenant_id == tenant_id, Voucher.code == code,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_voucher(
    db: "AsyncSession", *, voucher_id: int,
) -> Voucher:
    v = await db.get(Voucher, voucher_id)
    if v is None:
        raise VoucherNotFoundError(f"voucher #{voucher_id} no existe")
    return v


async def issue_voucher(
    db: "AsyncSession",
    *,
    wallet_id: int,
    actor: Actor,
    request: VoucherIn,
    trigger_event_id: str | None = None,
) -> Voucher:
    """Emite un voucher activo en la wallet.

    Levanta DuplicateVoucherCodeError si el code ya existe en el
    tenant. El caller decide el code o lo genera con
    `platform.ids.new_id('vch')`.
    """
    wallet = await get_by_id(db, wallet_id=wallet_id)

    exists = await find_voucher(db, tenant_id=wallet.tenant_id, code=request.code)
    if exists is not None:
        raise DuplicateVoucherCodeError(
            tenant_id=wallet.tenant_id, code=request.code,
        )

    voucher = Voucher(
        tenant_id=wallet.tenant_id,
        wallet_id=wallet_id,
        customer_id=wallet.customer_id,
        code=request.code,
        title=request.title,
        description=request.description,
        conditions_snapshot=dict(request.conditions_snapshot),
        state=VoucherState.ACTIVE,
        origin=request.origin,
        origin_ref=request.origin_ref,
        expires_at=request.expires_at,
    )
    db.add(voucher)
    await db.flush()

    await publish(
        Event(
            type=WALLET_VOUCHER_ISSUED,
            tenant_id=wallet.tenant_id,
            actor=actor,
            subject=Subject(kind="voucher", id=voucher.id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "wallet_id": wallet_id,
                "customer_id": wallet.customer_id,
                "code": voucher.code,
                "title": voucher.title,
                "origin": voucher.origin,
                "expires_at": (
                    voucher.expires_at.isoformat()
                    if voucher.expires_at else None
                ),
            },
        ),
        db,
    )
    return voucher


def _assert_transition(voucher: Voucher, target: VoucherState) -> None:
    if voucher.state is not VoucherState.ACTIVE:
        raise VoucherStateError(
            voucher_id=voucher.id,
            current=voucher.state.value,
            attempted=target.value,
        )


async def redeem_voucher(
    db: "AsyncSession",
    *,
    tenant_id: int,
    code: str,
    actor: Actor,
    trigger_event_id: str | None = None,
) -> Voucher:
    """Marca voucher como REDEEMED y emite evento."""
    v = await find_voucher(db, tenant_id=tenant_id, code=code)
    if v is None:
        raise VoucherNotFoundError(
            f"voucher {code!r} no existe para tenant {tenant_id}"
        )
    _assert_transition(v, VoucherState.REDEEMED)

    now = datetime.now(timezone.utc)
    if v.expires_at is not None and v.expires_at <= now:
        # Está vencido — marcarlo expired en vez de redimir.
        v.state = VoucherState.EXPIRED
        return v

    v.state = VoucherState.REDEEMED
    v.redeemed_at = now

    await publish(
        Event(
            type=WALLET_VOUCHER_REDEEMED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="voucher", id=v.id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "wallet_id": v.wallet_id,
                "customer_id": v.customer_id,
                "code": v.code,
                "title": v.title,
                "origin": v.origin,
                "redeemed_at": now.isoformat(),
            },
        ),
        db,
    )
    return v


async def expire_voucher(
    db: "AsyncSession",
    *,
    voucher_id: int,
    trigger_event_id: str | None = None,
    actor: Actor | None = None,
) -> Voucher:
    """Marca voucher como EXPIRED (llamado por cron o similar)."""
    from app.modules.platform.events.envelope import ActorKind

    v = await get_voucher(db, voucher_id=voucher_id)
    _assert_transition(v, VoucherState.EXPIRED)

    v.state = VoucherState.EXPIRED
    now = datetime.now(timezone.utc)

    await publish(
        Event(
            type=WALLET_VOUCHER_EXPIRED,
            tenant_id=v.tenant_id,
            actor=actor or Actor(kind=ActorKind.SYSTEM),
            subject=Subject(kind="voucher", id=v.id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "wallet_id": v.wallet_id,
                "customer_id": v.customer_id,
                "code": v.code,
                "expired_at": now.isoformat(),
            },
        ),
        db,
    )
    return v


async def revoke_voucher(
    db: "AsyncSession",
    *,
    voucher_id: int,
    actor: Actor,
    reason: str | None = None,
    trigger_event_id: str | None = None,
) -> Voucher:
    """Un admin anula un voucher activo (fraude, error, cambio de reglas)."""
    v = await get_voucher(db, voucher_id=voucher_id)
    _assert_transition(v, VoucherState.REVOKED)

    v.state = VoucherState.REVOKED
    now = datetime.now(timezone.utc)
    v.revoked_at = now

    await publish(
        Event(
            type=WALLET_VOUCHER_REVOKED,
            tenant_id=v.tenant_id,
            actor=actor,
            subject=Subject(kind="voucher", id=v.id),
            context=EventContext(trigger_event_id=trigger_event_id),
            data={
                "wallet_id": v.wallet_id,
                "customer_id": v.customer_id,
                "code": v.code,
                "reason": reason,
                "revoked_at": now.isoformat(),
            },
        ),
        db,
    )
    return v


async def list_active_vouchers(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int,
) -> list[Voucher]:
    stmt = (
        select(Voucher)
        .where(
            Voucher.tenant_id == tenant_id,
            Voucher.customer_id == customer_id,
            Voucher.state == VoucherState.ACTIVE,
        )
        .order_by(Voucher.expires_at.asc().nullslast(), Voucher.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


# Import tardío para evitar circulares.
from app.modules.wallet.errors import WalletModuleError  # noqa: E402
