"""
Servicio de comisiones escalonadas (tiered) por vendedor + rifa.

Modelo de "tier calificador": el tramo que el vendedor alcanza por la cantidad
total de boletas pagadas en una rifa aplica a TODAS sus boletas vendidas en esa
rifa, no marginalmente.

Ejemplos con tramos [1-30: 3000], [31-50: 4000], [51+: 5000]:
  - 25 boletas → 25 * 3000 = 75.000
  - 36 boletas → 36 * 4000 = 144.000
  - 60 boletas → 60 * 5000 = 300.000

Cuando un nuevo pago se confirma y cruza un tramo, se recalculan TODAS las
comisiones previas pendientes del vendedor en esa rifa al nuevo monto.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Iterable

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commission import Commission
from app.models.payment import Payment, PaymentStatus
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus


def tier_amount_for_count(tiers: list[dict] | None, count: int) -> Decimal | None:
    """Devuelve el monto por boleta del tramo en que cae `count`. None si no hay tiers."""
    if not tiers:
        return None
    ordered = sorted(tiers, key=lambda t: t["from_count"])
    chosen = None
    for t in ordered:
        from_c = int(t["from_count"])
        to_c = t.get("to_count")
        to_c = int(to_c) if to_c is not None else None
        if count >= from_c and (to_c is None or count <= to_c):
            chosen = t
            break
    if chosen is None:
        chosen = ordered[-1] if count >= ordered[-1]["from_count"] else ordered[0]
    return Decimal(str(chosen["amount_per_ticket"]))


async def count_paid_tickets_by_seller(
    db: AsyncSession, *, seller_id: int, raffle_id: int
) -> int:
    """Cuenta las boletas pagadas (status=PAID) del vendedor en la rifa."""
    res = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.seller_id == seller_id,
            Ticket.raffle_id == raffle_id,
            Ticket.status == TicketStatus.PAID,
        )
    )
    return int(res.scalar_one() or 0)


async def recalculate_commissions_for_seller(
    db: AsyncSession, *, seller_id: int, raffle: Raffle, new_amount: Decimal
) -> int:
    """Pone el nuevo monto a TODAS las comisiones del vendedor+rifa que aún no se hayan pagado.
    Devuelve la cantidad de comisiones actualizadas."""
    res = await db.execute(
        update(Commission)
        .where(
            Commission.seller_id == seller_id,
            Commission.raffle_id == raffle.id,
            Commission.paid.is_(False),
        )
        .values(amount=new_amount)
    )
    return res.rowcount or 0


def resolve_commission_amount(
    raffle: Raffle, paid_count_after: int
) -> Decimal:
    """Calcula el monto por boleta según los tiers de la rifa y la cantidad total
    de boletas pagadas (incluyendo la actual). Si no hay tiers, usa el flat."""
    tiered = tier_amount_for_count(raffle.commission_tiers, paid_count_after)
    if tiered is not None:
        return tiered
    return Decimal(str(raffle.seller_commission or 0))


async def create_commission_for_paid_ticket(
    db: AsyncSession,
    *,
    ticket: Ticket,
    raffle: Raffle,
    payment_id: int,
) -> Commission | None:
    """Crea (idempotentemente) la Commission para una boleta recién marcada PAID.

    - Si la boleta no tiene seller_id, no genera comisión.
    - Si ya existe una Commission para este ticket+seller, no la duplica.
    - Si la rifa usa tiers, recalcula también las comisiones previas del
      vendedor en la rifa (modelo de tier calificador).

    Asume que ticket.status YA está PAID y el cambio fue flushed; usa esa
    cuenta para resolver el tramo.
    """
    if not ticket.seller_id:
        return None

    # Idempotencia: si ya hay una commission para este ticket, no la dupliques.
    existing = (
        await db.execute(
            select(Commission).where(
                Commission.ticket_id == ticket.id,
                Commission.seller_id == ticket.seller_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    paid_count_after = await count_paid_tickets_by_seller(
        db, seller_id=ticket.seller_id, raffle_id=raffle.id
    )
    amount_per_ticket = resolve_commission_amount(raffle, paid_count_after)
    if amount_per_ticket <= 0:
        return None

    commission = Commission(
        seller_id=ticket.seller_id,
        raffle_id=raffle.id,
        ticket_id=ticket.id,
        payment_id=payment_id,
        amount=amount_per_ticket,
        status="pending",
        paid=False,
    )
    db.add(commission)
    await db.flush()

    # Tier calificador: si cruzó un tramo, equipara los anteriores pendientes.
    if raffle.commission_tiers:
        await recalculate_commissions_for_seller(
            db,
            seller_id=ticket.seller_id,
            raffle=raffle,
            new_amount=amount_per_ticket,
        )

    return commission
