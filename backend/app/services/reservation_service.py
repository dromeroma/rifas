"""
Reservas de boletas con expiración automática.

Reglas:
  - Una boleta sólo puede reservarse si está AVAILABLE.
  - La reserva dura `RESERVATION_HOURS` (default 24h).
  - Si la rifa entra en ventana de bloqueo (LOCK_DAYS_BEFORE_DRAW antes de
    cualquier sorteo de premio o de la fecha final) no se permiten reservas.
  - Se usa SELECT ... FOR UPDATE para evitar doble reserva concurrente.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ReservationLockedError, TicketUnavailableError
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.prize import Prize
from app.models.raffle import Raffle
from app.models.reservation import Reservation
from app.models.ticket import Ticket, TicketStatus
from app.services.commission_service import create_commission_for_paid_ticket

settings = get_settings()


def _is_locked(raffle: Raffle, prizes: list[Prize], today: date) -> bool:
    threshold = settings.lock_days_before_draw
    dates = [p.draw_date for p in prizes] + [raffle.final_draw_date]
    for d in dates:
        if (d - today).days <= threshold:
            return True
    return False


async def reserve_ticket(
    db: AsyncSession,
    *,
    ticket_id: int,
    seller_id: int,
    customer_id: int | None = None,
) -> Reservation:
    # Lock fila de la boleta
    ticket = (
        await db.execute(
            select(Ticket).where(Ticket.id == ticket_id).with_for_update()
        )
    ).scalar_one_or_none()
    if ticket is None:
        raise TicketUnavailableError("boleta no encontrada")

    if ticket.status != TicketStatus.AVAILABLE:
        raise TicketUnavailableError(f"boleta no disponible (estado={ticket.status})")

    raffle = (await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))).scalar_one()
    prizes = (await db.execute(select(Prize).where(Prize.raffle_id == raffle.id))).scalars().all()

    if _is_locked(raffle, list(prizes), date.today()):
        raise ReservationLockedError("ventana de reservas cerrada (proximidad al sorteo)")

    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.reservation_hours)

    reservation = Reservation(
        ticket_id=ticket.id,
        seller_id=seller_id,
        customer_id=customer_id,
        expires_at=expires_at,
        is_active=True,
    )

    ticket.status = TicketStatus.RESERVED
    ticket.seller_id = seller_id
    ticket.customer_id = customer_id
    ticket.version += 1

    db.add(reservation)
    await db.flush()
    return reservation


async def release_reservation(
    db: AsyncSession,
    *,
    reservation_id: int,
    reason: str = "cancelled",
) -> None:
    reservation = (
        await db.execute(select(Reservation).where(Reservation.id == reservation_id).with_for_update())
    ).scalar_one_or_none()
    if not reservation or not reservation.is_active:
        return

    ticket = (await db.execute(select(Ticket).where(Ticket.id == reservation.ticket_id).with_for_update())).scalar_one()
    # Liberamos también si quedó en PENDING_PAYMENT (cliente subió comprobante pero no se confirmó)
    if ticket.status in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT):
        ticket.status = TicketStatus.AVAILABLE
        ticket.customer_id = None
        ticket.version += 1

    reservation.is_active = False
    reservation.released_at = datetime.now(timezone.utc)
    reservation.release_reason = reason
    await db.flush()


async def release_by_ticket(
    db: AsyncSession,
    *,
    ticket_id: int,
    reason: str = "cancelled",
) -> bool:
    """Libera la reserva activa de una boleta. Devuelve True si liberó algo."""
    res = (
        await db.execute(
            select(Reservation).where(
                Reservation.ticket_id == ticket_id,
                Reservation.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not res:
        # Defensivo: si no hay reservation activa pero ticket sigue reservado, lo limpiamos
        ticket = (await db.execute(select(Ticket).where(Ticket.id == ticket_id).with_for_update())).scalar_one_or_none()
        if ticket and ticket.status in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT):
            ticket.status = TicketStatus.AVAILABLE
            ticket.customer_id = None
            ticket.version += 1
            await db.flush()
            return True
        return False
    await release_reservation(db, reservation_id=res.id, reason=reason)
    return True


async def mark_ticket_paid(
    db: AsyncSession, *, ticket_id: int, actor_id: int | None = None,
) -> Ticket:
    """Marca una boleta como pagada (sin comprobante) y:
      1) Crea un Payment "fantasma" con status=CONFIRMED y method=CASH para
         dejar trazabilidad y permitir la FK obligatoria de Commission.
      2) Genera la Commission del vendedor según los tiers configurados.
      3) Cierra la reserva activa con motivo 'paid'.

    El Payment.amount = ticket_price de la rifa.
    """
    ticket = (
        await db.execute(select(Ticket).where(Ticket.id == ticket_id).with_for_update())
    ).scalar_one_or_none()
    if not ticket:
        raise TicketUnavailableError("boleta no encontrada")

    if ticket.status not in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT):
        raise TicketUnavailableError(
            f"la boleta no puede marcarse como pagada (estado actual: {ticket.status.value})"
        )

    if ticket.customer_id is None:
        raise TicketUnavailableError("la boleta no tiene cliente asociado")

    raffle = (
        await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))
    ).scalar_one()

    now = datetime.now(timezone.utc)

    # 1) Crear Payment fantasma (CASH, sin comprobante) para mantener
    #    consistencia: toda boleta PAID tiene un Payment CONFIRMED y una
    #    Commission asociada.
    payment = Payment(
        ticket_id=ticket.id,
        customer_id=ticket.customer_id,
        seller_id=ticket.seller_id,
        method=PaymentMethod.CASH,
        amount=raffle.ticket_price,
        reference=None,
        notes="Marcada pagada directamente (sin comprobante).",
        proof_url=None,
        status=PaymentStatus.CONFIRMED,
        confirmed_by=actor_id,
        confirmed_at=now,
    )
    db.add(payment)

    # 2) Cambiar status del ticket
    ticket.status = TicketStatus.PAID
    ticket.version += 1
    await db.flush()  # asegura payment.id y status PAID para count del tier

    # 3) Generar Commission según tier
    await create_commission_for_paid_ticket(
        db, ticket=ticket, raffle=raffle, payment_id=payment.id,
    )

    # 4) Cerrar reserva activa con motivo "paid"
    res = (
        await db.execute(
            select(Reservation).where(
                Reservation.ticket_id == ticket_id,
                Reservation.is_active.is_(True),
            ).with_for_update()
        )
    ).scalar_one_or_none()
    if res:
        res.is_active = False
        res.released_at = now
        res.release_reason = "paid"

    await db.flush()
    return ticket


async def expire_overdue(db: AsyncSession) -> int:
    """Worker: libera todas las reservas vencidas. Retorna cuántas se liberaron."""
    now = datetime.now(timezone.utc)
    overdue = (
        await db.execute(
            select(Reservation).where(
                Reservation.is_active.is_(True),
                Reservation.expires_at <= now,
            )
        )
    ).scalars().all()
    count = 0
    for r in overdue:
        await release_reservation(db, reservation_id=r.id, reason="expired")
        count += 1
    if count:
        await db.commit()
    return count
