"""
Servicio de pagos: subir comprobante, confirmar, rechazar.

Soporta pagos fraccionados: una boleta puede tener N Payments. Mientras la
suma de `Payment.amount` de los CONFIRMED no alcance `raffle.ticket_price`,
el ticket queda en `PARTIALLY_PAID` (o `PENDING_PAYMENT` si hay una cuota sin
confirmar). Al alcanzar el total, el ticket pasa a `PAID` y se genera la
comisión del vendedor (solo una vez, contra el último Payment).

Flujo:
  1. Vendedor reserva la boleta (status=RESERVED).
  2. Cliente paga directamente (puede ser parcial). Vendedor sube comprobante:
     - Se crea Payment con status=PENDING.
     - Ticket pasa a PENDING_PAYMENT (la cuota nueva está pendiente).
  3. Admin confirma o rechaza:
     - CONFIRMED:
         * Si paid_amount + amount >= ticket_price → Ticket PAID + Commission.
         * Si todavía falta → Ticket PARTIALLY_PAID, el vendedor puede seguir
           reportando cuotas.
     - REJECTED:
         * Si el ticket tenía otras cuotas CONFIRMED → vuelve a PARTIALLY_PAID.
         * Si no había confirmadas → vuelve a RESERVED.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import BinaryIO

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import (
    DomainError,
    PaymentAlreadyConfirmedError,
    TicketUnavailableError,
)
from app.models.commission import Commission
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus
from app.services.commission_service import create_commission_for_paid_ticket

settings = get_settings()

from app.services.storage_service import upload_proof as _upload_proof_to_storage


# Estados desde los que se acepta una nueva cuota.
_OPEN_STATUSES = (
    TicketStatus.RESERVED,
    TicketStatus.PENDING_PAYMENT,
    TicketStatus.PARTIALLY_PAID,
)


async def _sum_confirmed_payments(db: AsyncSession, ticket_id: int) -> Decimal:
    """Suma de Payment.amount de los pagos CONFIRMED de un ticket."""
    total = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.ticket_id == ticket_id,
                Payment.status == PaymentStatus.CONFIRMED,
            )
        )
    ).scalar_one()
    return Decimal(total)


async def submit_payment(
    db: AsyncSession,
    *,
    ticket_id: int,
    actor_id: int,
    method: PaymentMethod,
    amount: Decimal,
    reference: str | None,
    notes: str | None,
    proof_file: BinaryIO | None,
    proof_filename: str | None,
) -> Payment:
    """Vendedor sube comprobante de una cuota. Ticket pasa a PENDING_PAYMENT."""
    ticket = (
        await db.execute(select(Ticket).where(Ticket.id == ticket_id).with_for_update())
    ).scalar_one_or_none()
    if not ticket:
        raise TicketUnavailableError("boleta no encontrada")

    if ticket.status not in _OPEN_STATUSES:
        raise TicketUnavailableError(
            f"la boleta debe estar reservada o con pagos pendientes para reportar pago (estado: {ticket.status.value})"
        )

    if ticket.customer_id is None:
        raise TicketUnavailableError("la boleta no tiene cliente asociado")

    if amount <= 0:
        raise DomainError("el monto debe ser mayor a cero")

    # Validar que no se exceda el precio total con las cuotas ya confirmadas + la nueva.
    raffle = (
        await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))
    ).scalar_one()
    confirmed_total = Decimal(ticket.paid_amount or 0)
    remaining = Decimal(raffle.ticket_price) - confirmed_total
    if remaining <= 0:
        raise DomainError("la boleta ya está totalmente pagada")
    if amount > remaining:
        raise DomainError(
            f"el monto supera el saldo pendiente. Faltan ${remaining} por cubrir."
        )

    proof_url: str | None = None
    if proof_file is not None and proof_filename:
        try:
            proof_url = _upload_proof_to_storage(proof_file, proof_filename)
        except ValueError as e:
            raise DomainError(str(e))

    payment = Payment(
        ticket_id=ticket.id,
        customer_id=ticket.customer_id,
        seller_id=ticket.seller_id,
        method=method,
        amount=amount,
        reference=reference,
        notes=notes,
        proof_url=proof_url,
        status=PaymentStatus.PENDING,
    )
    db.add(payment)

    # Mientras la cuota nueva esté pendiente, el ticket queda en PENDING_PAYMENT
    # incluso si ya tenía pagos parciales confirmados. Al rechazar volverá a
    # PARTIALLY_PAID si correspondía.
    ticket.status = TicketStatus.PENDING_PAYMENT
    ticket.version += 1

    await db.flush()
    return payment


async def confirm_payment(
    db: AsyncSession, *, payment_id: int, confirmed_by_user_id: int,
) -> tuple[Payment, Ticket, Commission | None]:
    """Admin confirma una cuota.

    Si la suma de cuotas confirmadas (incluyendo ésta) cubre el ticket_price,
    el ticket pasa a PAID y se genera la Commission. Si todavía falta, queda
    en PARTIALLY_PAID y el vendedor puede seguir reportando cuotas.
    """
    payment = (
        await db.execute(select(Payment).where(Payment.id == payment_id).with_for_update())
    ).scalar_one_or_none()
    if not payment:
        raise DomainError("pago no encontrado")

    if payment.status == PaymentStatus.CONFIRMED:
        raise PaymentAlreadyConfirmedError("este pago ya está confirmado")

    if payment.status == PaymentStatus.REJECTED:
        raise DomainError("no se puede confirmar un pago previamente rechazado")

    ticket = (
        await db.execute(select(Ticket).where(Ticket.id == payment.ticket_id).with_for_update())
    ).scalar_one()

    if ticket.status not in _OPEN_STATUSES:
        raise TicketUnavailableError(
            f"la boleta ya no acepta pagos (estado: {ticket.status.value})"
        )

    raffle = (
        await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))
    ).scalar_one()

    payment.status = PaymentStatus.CONFIRMED
    payment.confirmed_by = confirmed_by_user_id
    payment.confirmed_at = datetime.now(timezone.utc)

    # Recalcular paid_amount sumando todos los CONFIRMED de este ticket (incluyendo el actual).
    await db.flush()
    new_paid = await _sum_confirmed_payments(db, ticket.id)
    ticket.paid_amount = new_paid
    ticket.version += 1

    commission: Commission | None = None
    price = Decimal(raffle.ticket_price)
    if new_paid >= price:
        # Total cubierto → ticket PAID + comisión.
        ticket.status = TicketStatus.PAID
        await db.flush()
        commission = await create_commission_for_paid_ticket(
            db, ticket=ticket, raffle=raffle, payment_id=payment.id,
        )
    else:
        # Aún falta → PARTIALLY_PAID. Sin comisión hasta completar.
        ticket.status = TicketStatus.PARTIALLY_PAID

    await db.flush()
    return payment, ticket, commission


async def reject_payment(
    db: AsyncSession, *, payment_id: int, rejected_by_user_id: int, reason: str,
) -> tuple[Payment, Ticket]:
    """Admin rechaza la cuota pendiente.

    Si quedan otras cuotas CONFIRMED, el ticket vuelve a PARTIALLY_PAID. Si no
    había confirmadas, vuelve a RESERVED.
    """
    payment = (
        await db.execute(select(Payment).where(Payment.id == payment_id).with_for_update())
    ).scalar_one_or_none()
    if not payment:
        raise DomainError("pago no encontrado")

    if payment.status != PaymentStatus.PENDING:
        raise DomainError(
            f"solo se pueden rechazar pagos pendientes (estado actual: {payment.status.value})"
        )

    ticket = (
        await db.execute(select(Ticket).where(Ticket.id == payment.ticket_id).with_for_update())
    ).scalar_one()

    payment.status = PaymentStatus.REJECTED
    payment.rejection_reason = reason

    # Si el ticket sigue pendiente por esta cuota, revertimos al estado
    # correspondiente según haya o no cuotas confirmadas previas.
    if ticket.status == TicketStatus.PENDING_PAYMENT:
        confirmed_total = await _sum_confirmed_payments(db, ticket.id)
        if confirmed_total > 0:
            ticket.status = TicketStatus.PARTIALLY_PAID
            ticket.paid_amount = confirmed_total
        else:
            ticket.status = TicketStatus.RESERVED
            ticket.paid_amount = Decimal(0)
        ticket.version += 1

    await db.flush()
    return payment, ticket
