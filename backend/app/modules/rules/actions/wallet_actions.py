"""Actions bundled que usan el módulo wallet.

Registradas al import — el `rules/actions/__init__.py` importa este
módulo para el side-effect.

Convención de params (validada por Pydantic en el service o
directamente aquí para actions específicas):

  wallet.credit_points
    - amount: numérico o expresión ya resuelta.
    - reason: str opcional (memo).
    - expires_in_days: int opcional.

  wallet.credit_cashback
    - amount: numérico.
    - reason: str opcional.

  wallet.credit_xp
    - amount: numérico.

  wallet.issue_voucher
    - code: str (código único por tenant).
    - title: str.
    - description: str opcional.
    - expires_in_days: int opcional.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, TYPE_CHECKING

from app.modules.platform.events import Actor, ActorKind
from app.modules.rules.actions.registry import action_registry
from app.modules.rules.errors import ActionExecutionError
from app.modules.wallet import (
    BalanceType,
    CreditRequest,
    LedgerCause,
    VoucherIn,
    credit,
    find_or_create,
    issue_voucher,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.platform.events import Event

logger = logging.getLogger(__name__)


def _decimal_amount(value: Any, *, action_type: str) -> Decimal:
    """Coerciona a Decimal. Rechaza no-numéricos y <= 0."""
    if value is None:
        raise ActionExecutionError(
            action_type, ValueError("amount requerido"),
        )
    try:
        amount = Decimal(str(value))
    except (ArithmeticError, ValueError) as exc:
        raise ActionExecutionError(action_type, exc) from exc
    if amount <= 0:
        raise ActionExecutionError(
            action_type,
            ValueError(f"amount debe ser > 0, recibido {amount}"),
        )
    return amount


def _expires_at(days: int | None) -> datetime | None:
    if days is None:
        return None
    return datetime.now(timezone.utc) + timedelta(days=int(days))


@action_registry.register("wallet.credit_points")
async def credit_points(
    *,
    db: "AsyncSession",
    tenant_id: int,
    event: "Event",
    params: dict[str, Any],
    customer_id: int | None,
    trigger_event_id: str | None = None,
) -> dict[str, Any]:
    """Suma puntos a la wallet del customer."""
    if customer_id is None:
        raise ActionExecutionError(
            "wallet.credit_points",
            ValueError("no se pudo derivar customer_id del evento"),
        )

    amount = _decimal_amount(
        params.get("amount"), action_type="wallet.credit_points",
    )
    wallet = await find_or_create(
        db,
        tenant_id=tenant_id,
        customer_id=customer_id,
        actor=Actor(kind=ActorKind.RULE),
        trigger_event_id=trigger_event_id,
    )
    entry = await credit(
        db,
        wallet_id=wallet.id,
        actor=Actor(kind=ActorKind.RULE),
        request=CreditRequest(
            balance_type=BalanceType.POINTS,
            amount=amount,
            cause=LedgerCause.RULE,
            cause_ref=params.get("cause_ref"),
            memo=params.get("reason"),
            expires_at=_expires_at(params.get("expires_in_days")),
        ),
        trigger_event_id=trigger_event_id,
    )
    return {
        "action": "wallet.credit_points",
        "wallet_id": wallet.id,
        "amount": str(amount),
        "ledger_entry_id": entry.id,
    }


@action_registry.register("wallet.credit_cashback")
async def credit_cashback(
    *,
    db: "AsyncSession",
    tenant_id: int,
    event: "Event",
    params: dict[str, Any],
    customer_id: int | None,
    trigger_event_id: str | None = None,
) -> dict[str, Any]:
    """Suma cashback (COP) a la wallet."""
    if customer_id is None:
        raise ActionExecutionError(
            "wallet.credit_cashback",
            ValueError("no se pudo derivar customer_id del evento"),
        )

    amount = _decimal_amount(
        params.get("amount"), action_type="wallet.credit_cashback",
    )
    wallet = await find_or_create(
        db,
        tenant_id=tenant_id,
        customer_id=customer_id,
        actor=Actor(kind=ActorKind.RULE),
        trigger_event_id=trigger_event_id,
    )
    entry = await credit(
        db,
        wallet_id=wallet.id,
        actor=Actor(kind=ActorKind.RULE),
        request=CreditRequest(
            balance_type=BalanceType.CASHBACK_COP,
            amount=amount,
            cause=LedgerCause.RULE,
            cause_ref=params.get("cause_ref"),
            memo=params.get("reason"),
        ),
        trigger_event_id=trigger_event_id,
    )
    return {
        "action": "wallet.credit_cashback",
        "wallet_id": wallet.id,
        "amount": str(amount),
        "ledger_entry_id": entry.id,
    }


@action_registry.register("wallet.credit_xp")
async def credit_xp(
    *,
    db: "AsyncSession",
    tenant_id: int,
    event: "Event",
    params: dict[str, Any],
    customer_id: int | None,
    trigger_event_id: str | None = None,
) -> dict[str, Any]:
    """Suma XP (gamificación — no canjeable)."""
    if customer_id is None:
        raise ActionExecutionError(
            "wallet.credit_xp",
            ValueError("no se pudo derivar customer_id del evento"),
        )

    amount = _decimal_amount(
        params.get("amount"), action_type="wallet.credit_xp",
    )
    wallet = await find_or_create(
        db,
        tenant_id=tenant_id,
        customer_id=customer_id,
        actor=Actor(kind=ActorKind.RULE),
        trigger_event_id=trigger_event_id,
    )
    entry = await credit(
        db,
        wallet_id=wallet.id,
        actor=Actor(kind=ActorKind.RULE),
        request=CreditRequest(
            balance_type=BalanceType.XP,
            amount=amount,
            cause=LedgerCause.RULE,
            cause_ref=params.get("cause_ref"),
            memo=params.get("reason"),
        ),
        trigger_event_id=trigger_event_id,
    )
    return {
        "action": "wallet.credit_xp",
        "wallet_id": wallet.id,
        "amount": str(amount),
        "ledger_entry_id": entry.id,
    }


@action_registry.register("wallet.issue_voucher")
async def issue_voucher_action(
    *,
    db: "AsyncSession",
    tenant_id: int,
    event: "Event",
    params: dict[str, Any],
    customer_id: int | None,
    trigger_event_id: str | None = None,
) -> dict[str, Any]:
    """Emite un cupón nuevo en la wallet del customer."""
    if customer_id is None:
        raise ActionExecutionError(
            "wallet.issue_voucher",
            ValueError("no se pudo derivar customer_id del evento"),
        )

    code = params.get("code")
    title = params.get("title")
    if not code or not title:
        raise ActionExecutionError(
            "wallet.issue_voucher",
            ValueError("code y title son requeridos"),
        )

    wallet = await find_or_create(
        db,
        tenant_id=tenant_id,
        customer_id=customer_id,
        actor=Actor(kind=ActorKind.RULE),
        trigger_event_id=trigger_event_id,
    )
    voucher = await issue_voucher(
        db,
        wallet_id=wallet.id,
        actor=Actor(kind=ActorKind.RULE),
        request=VoucherIn(
            code=str(code),
            title=str(title),
            description=params.get("description"),
            conditions_snapshot=dict(params.get("conditions", {})),
            origin="rule",
            origin_ref=params.get("origin_ref"),
            expires_at=_expires_at(params.get("expires_in_days")),
        ),
        trigger_event_id=trigger_event_id,
    )
    return {
        "action": "wallet.issue_voucher",
        "voucher_id": voucher.id,
        "code": voucher.code,
    }
