"""
Servicio de pagos: subir comprobante, confirmar, rechazar.

Flujo:
  1. Vendedor reserva la boleta (status=reserved)
  2. Cliente paga directamente a la cuenta del negocio
  3. Vendedor (o cliente) sube el comprobante:
     - Se crea registro Payment con status=PENDING
     - Boleta pasa a PENDING_PAYMENT
  4. Admin confirma o rechaza:
     - CONFIRMADO: Payment.status=CONFIRMED, Ticket.status=PAID, se crea Commission
     - RECHAZADO: Payment.status=REJECTED, Ticket vuelve a RESERVED
"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import select
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

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


def _save_proof_file(file: BinaryIO, original_filename: str) -> str:
    """Guarda el archivo con nombre aleatorio dentro de UPLOAD_DIR/payments/.
    Devuelve el filename guardado (sin path) para almacenar en BD."""
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise DomainError(f"extensión no permitida: {ext}")

    upload_dir = Path(settings.upload_dir) / "payments"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Token aleatorio + hash de contenido (suficiente para evitar colisiones)
    rnd = secrets.token_hex(12)
    filename = f"{rnd}{ext}"
    target = upload_dir / filename

    with open(target, "wb") as out:
        # Streaming para archivos grandes
        while True:
            chunk = file.read(64 * 1024)
            if not chunk:
                break
            out.write(chunk)

    return filename


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
    """Vendedor sube comprobante de pago. Ticket pasa a PENDING_PAYMENT."""
    ticket = (
        await db.execute(select(Ticket).where(Ticket.id == ticket_id).with_for_update())
    ).scalar_one_or_none()
    if not ticket:
        raise TicketUnavailableError("boleta no encontrada")

    if ticket.status not in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT):
        raise TicketUnavailableError(
            f"la boleta debe estar reservada para reportar pago (estado: {ticket.status.value})"
        )

    if ticket.customer_id is None:
        raise TicketUnavailableError("la boleta no tiene cliente asociado")

    proof_url: str | None = None
    if proof_file is not None and proof_filename:
        saved = _save_proof_file(proof_file, proof_filename)
        proof_url = f"payments/{saved}"

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

    ticket.status = TicketStatus.PENDING_PAYMENT
    ticket.version += 1

    await db.flush()
    return payment


async def confirm_payment(
    db: AsyncSession, *, payment_id: int, confirmed_by_user_id: int,
) -> tuple[Payment, Ticket, Commission | None]:
    """Admin confirma el pago. Ticket pasa a PAID y se genera Commission."""
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

    if ticket.status not in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT):
        raise TicketUnavailableError(
            f"la boleta ya no está pendiente (estado: {ticket.status.value})"
        )

    raffle = (
        await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))
    ).scalar_one()

    payment.status = PaymentStatus.CONFIRMED
    payment.confirmed_by = confirmed_by_user_id
    payment.confirmed_at = datetime.now(timezone.utc)

    ticket.status = TicketStatus.PAID
    ticket.version += 1

    # Flush para que la boleta cuente como PAID al calcular el tier.
    await db.flush()

    commission = await create_commission_for_paid_ticket(
        db, ticket=ticket, raffle=raffle, payment_id=payment.id,
    )

    await db.flush()
    return payment, ticket, commission


async def reject_payment(
    db: AsyncSession, *, payment_id: int, rejected_by_user_id: int, reason: str,
) -> tuple[Payment, Ticket]:
    """Admin rechaza el pago. Ticket vuelve a RESERVED."""
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

    # El ticket vuelve a RESERVED si todavía está pendiente.
    # Si ya cambió (ej. otro admin lo confirmó), no tocamos.
    if ticket.status == TicketStatus.PENDING_PAYMENT:
        ticket.status = TicketStatus.RESERVED
        ticket.version += 1

    await db.flush()
    return payment, ticket
