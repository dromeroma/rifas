"""Integration tests del service de wallet.

Requiere DATABASE_URL_TEST. Cubre:
  - find_or_create idempotente + emite wallet.created solo la primera vez.
  - credit suma balance + registra ledger + publica evento.
  - debit valida saldo, permite negativo opt-in.
  - Invariante: balance nunca negativo por default.
  - Múltiples balance types coexisten en la misma wallet.
  - snapshot cuenta vouchers activos.
  - Vouchers: emitir, canjear, expirar, revocar — transiciones
    monotónicas.
  - Duplicate voucher code rechazado.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.platform.events import Actor, ActorKind
from app.modules.platform.events.models import EventOutbox
from app.modules.wallet import (
    BalanceType,
    CreditRequest,
    DebitRequest,
    DuplicateVoucherCodeError,
    InsufficientBalanceError,
    InvalidDeltaError,
    LedgerCause,
    Voucher,
    VoucherIn,
    VoucherState,
    VoucherStateError,
    WalletLedger,
    credit,
    debit,
    events as wallet_events,
    expire_voucher,
    find_or_create,
    get_balance,
    issue_voucher,
    list_active_vouchers,
    redeem_voucher,
    revoke_voucher,
    snapshot,
)


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Test Tenant', 'wallet-test', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


@pytest_asyncio.fixture
async def customer_id(integration_db, tenant_id) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO customers (
                tenant_id, full_name, email, phone, document, created_at, updated_at
            )
            VALUES (:tid, 'Test Customer', 'test@test.co', '3000000000', 'CC1', now(), now())
            RETURNING id
            """
        ),
        {"tid": tenant_id},
    )
    cid = int(result.scalar_one())
    await integration_db.commit()
    return cid


def _actor(kind=ActorKind.SYSTEM):
    return Actor(kind=kind)


async def _outbox_types(db, subject_kind: str, subject_id) -> list[str]:
    stmt = (
        select(EventOutbox.type)
        .where(EventOutbox.subject["kind"].astext == subject_kind)
        .where(EventOutbox.subject["id"].astext == str(subject_id))
        .order_by(EventOutbox.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


class TestFindOrCreate:
    async def test_creates_and_emits_event(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id,
            customer_id=customer_id,
            actor=_actor(),
        )
        await integration_db.commit()

        assert wallet.id > 0
        assert wallet.tenant_id == tenant_id
        assert wallet.customer_id == customer_id

        types = await _outbox_types(integration_db, "wallet", wallet.id)
        assert wallet_events.WALLET_CREATED in types

    async def test_idempotent(self, integration_db, tenant_id, customer_id):
        a = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        b = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await integration_db.commit()

        assert a.id == b.id

        types = await _outbox_types(integration_db, "wallet", a.id)
        assert types.count(wallet_events.WALLET_CREATED) == 1


class TestCredit:
    async def test_credit_updates_balance_and_ledger(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(
                balance_type=BalanceType.POINTS,
                amount=100,
                cause=LedgerCause.SIGNUP_BONUS,
                memo="bienvenida",
            ),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(
                balance_type=BalanceType.POINTS,
                amount=50,
                cause=LedgerCause.RULE,
            ),
        )
        await integration_db.commit()

        balance = await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.POINTS,
        )
        assert balance == Decimal(150)

        # 2 filas de ledger, en orden.
        rows = list(
            (
                await integration_db.execute(
                    select(WalletLedger)
                    .where(WalletLedger.wallet_id == wallet.id)
                    .order_by(WalletLedger.id.asc())
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 2
        assert rows[0].delta == Decimal(100)
        assert rows[0].balance_after == Decimal(100)
        assert rows[1].delta == Decimal(50)
        assert rows[1].balance_after == Decimal(150)

        types = await _outbox_types(integration_db, "wallet", wallet.id)
        # wallet.created + 2 credits
        assert types.count(wallet_events.WALLET_POINTS_CREDITED) == 2

    async def test_credit_zero_rejected(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        # Pydantic rechaza amount=0 en el schema → ValidationError.
        # El service reafirma con InvalidDeltaError si alguien lo bypasea.
        # Aquí probamos el rechazo del schema.
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            CreditRequest(balance_type=BalanceType.POINTS, amount=0)

    async def test_multiple_balance_types_coexist(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(balance_type=BalanceType.POINTS, amount=100),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(balance_type=BalanceType.XP, amount=250),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(
                balance_type=BalanceType.CASHBACK_COP, amount="1500.50",
            ),
        )
        await integration_db.commit()

        assert await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.POINTS,
        ) == Decimal(100)
        assert await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.XP,
        ) == Decimal(250)
        assert await get_balance(
            integration_db,
            wallet_id=wallet.id,
            balance_type=BalanceType.CASHBACK_COP,
        ) == Decimal("1500.50")


class TestDebit:
    async def test_debit_reduces_balance(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(balance_type=BalanceType.POINTS, amount=100),
        )
        await debit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=DebitRequest(
                balance_type=BalanceType.POINTS,
                amount=30,
                cause=LedgerCause.REDEMPTION,
                cause_ref="rdm_01H...",
            ),
        )
        await integration_db.commit()

        assert await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.POINTS,
        ) == Decimal(70)

        types = await _outbox_types(integration_db, "wallet", wallet.id)
        assert wallet_events.WALLET_POINTS_DEBITED in types

    async def test_debit_insufficient_by_default(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(balance_type=BalanceType.POINTS, amount=10),
        )
        await integration_db.commit()

        with pytest.raises(InsufficientBalanceError) as exc_info:
            await debit(
                integration_db,
                wallet_id=wallet.id,
                actor=_actor(),
                request=DebitRequest(
                    balance_type=BalanceType.POINTS, amount=50,
                ),
            )
        assert exc_info.value.available == Decimal(10)
        assert exc_info.value.attempted == Decimal(50)

        # El balance no cambió.
        await integration_db.rollback()
        assert await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.POINTS,
        ) == Decimal(10)

    async def test_debit_allow_negative(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await debit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=DebitRequest(
                balance_type=BalanceType.POINTS,
                amount=25,
                allow_negative=True,
                cause=LedgerCause.MANUAL_ADJUST,
                memo="corrección admin",
            ),
        )
        await integration_db.commit()

        assert await get_balance(
            integration_db, wallet_id=wallet.id, balance_type=BalanceType.POINTS,
        ) == Decimal(-25)

    async def test_expiration_uses_expired_event_type(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(balance_type=BalanceType.POINTS, amount=100),
        )
        await debit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=DebitRequest(
                balance_type=BalanceType.POINTS,
                amount=30,
                cause=LedgerCause.EXPIRATION,
            ),
        )
        await integration_db.commit()

        types = await _outbox_types(integration_db, "wallet", wallet.id)
        assert wallet_events.WALLET_POINTS_EXPIRED in types


class TestSnapshot:
    async def test_snapshot_with_balances_and_vouchers(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await credit(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=CreditRequest(balance_type=BalanceType.POINTS, amount=100),
        )
        await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="TESTV1", title="10% off"),
        )
        await integration_db.commit()

        snap = await snapshot(integration_db, wallet_id=wallet.id)
        assert snap.customer_id == customer_id
        assert len(snap.balances) == 1
        assert snap.balances[0].balance_type is BalanceType.POINTS
        assert snap.balances[0].amount == Decimal(100)
        assert snap.active_vouchers == 1


class TestVouchers:
    async def test_issue_redeem_flow(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        voucher = await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="V-100", title="Cupón bienvenida"),
        )
        await integration_db.commit()

        assert voucher.state is VoucherState.ACTIVE

        redeemed = await redeem_voucher(
            integration_db, tenant_id=tenant_id, code="V-100", actor=_actor(),
        )
        await integration_db.commit()

        assert redeemed.state is VoucherState.REDEEMED
        assert redeemed.redeemed_at is not None

        # Segundo intento de canje falla (ya no está ACTIVE).
        with pytest.raises(VoucherStateError):
            await redeem_voucher(
                integration_db, tenant_id=tenant_id, code="V-100", actor=_actor(),
            )

        types = await _outbox_types(integration_db, "voucher", voucher.id)
        assert wallet_events.WALLET_VOUCHER_ISSUED in types
        assert wallet_events.WALLET_VOUCHER_REDEEMED in types

    async def test_duplicate_code_rejected(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="DUP-1", title="Primero"),
        )
        await integration_db.commit()

        with pytest.raises(DuplicateVoucherCodeError):
            await issue_voucher(
                integration_db,
                wallet_id=wallet.id,
                actor=_actor(),
                request=VoucherIn(code="DUP-1", title="Segundo"),
            )

    async def test_revoke_from_active_only(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        v = await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="REV-1", title="cupón"),
        )
        await integration_db.commit()

        await revoke_voucher(
            integration_db, voucher_id=v.id, actor=_actor(ActorKind.MEMBER),
            reason="admin_correction",
        )
        await integration_db.commit()

        v_reload = await integration_db.get(Voucher, v.id)
        assert v_reload.state is VoucherState.REVOKED

    async def test_list_active_vouchers(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        # Un activo, uno canjeado, uno revocado.
        await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="A1", title="a"),
        )
        v_r = await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="A2", title="a"),
        )
        v_x = await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="A3", title="a"),
        )
        await integration_db.commit()

        await redeem_voucher(
            integration_db, tenant_id=tenant_id, code="A2", actor=_actor(),
        )
        await revoke_voucher(
            integration_db, voucher_id=v_x.id, actor=_actor(ActorKind.MEMBER),
        )
        await integration_db.commit()

        active = await list_active_vouchers(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        )
        assert [v.code for v in active] == ["A1"]

    async def test_expire_voucher(
        self, integration_db, tenant_id, customer_id,
    ):
        wallet = await find_or_create(
            integration_db,
            tenant_id=tenant_id, customer_id=customer_id, actor=_actor(),
        )
        v = await issue_voucher(
            integration_db,
            wallet_id=wallet.id,
            actor=_actor(),
            request=VoucherIn(code="EXP-1", title="a"),
        )
        await integration_db.commit()

        await expire_voucher(integration_db, voucher_id=v.id)
        await integration_db.commit()

        v_reload = await integration_db.get(Voucher, v.id)
        assert v_reload.state is VoucherState.EXPIRED
