"""
Servicio crítico: generación inmutable de números de boleta.

Reglas:
  1. Se construye todo el universo [number_min .. number_max].
  2. Se mezcla con secrets.SystemRandom (CSPRNG).
  3. Se reparte secuencialmente en bloques de `numbers_per_ticket` entre `total_tickets`.
  4. Se inserta en UNA transacción atómica.
  5. UNIQUE(raffle_id, number) garantiza a nivel SQL la no-repetición.
  6. Tras generar, raffle.numbers_generated = True y queda bloqueado para siempre.

Auditoría: se almacena un hash SHA-256 de la permutación como `numbers_seed`
para que el sorteo sea verificable a posteriori sin filtrar la asignación.
"""

from __future__ import annotations

import hashlib
import secrets
import string
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ImmutableRaffleError
from app.models.raffle import Raffle, RaffleStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_number import TicketNumber

_CODE_ALPHABET = string.ascii_uppercase + string.digits  # base32-like, sin ambigüedades


def _format_number(n: int, digits: int) -> str:
    return str(n).zfill(digits)


def _generate_ticket_code(rng: secrets.SystemRandom) -> str:
    """Genera un código tipo 7Z3-4K9-PLM (alta entropía, fácil de leer)."""
    parts = ["".join(rng.choice(_CODE_ALPHABET) for _ in range(3)) for _ in range(3)]
    return "-".join(parts)


def _generate_qr_payload(rng: secrets.SystemRandom) -> str:
    return secrets.token_urlsafe(24)


async def generate_raffle_numbers(db: AsyncSession, raffle_id: int) -> Raffle:
    """
    Genera la totalidad de boletas + números de una rifa.
    Operación irreversible.
    """
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if raffle is None:
        raise ValueError("rifa no encontrada")

    if raffle.numbers_generated:
        raise ImmutableRaffleError("la rifa ya tiene números generados; no se puede regenerar")

    total_numbers = raffle.number_max - raffle.number_min + 1
    required = raffle.total_tickets * raffle.numbers_per_ticket
    if total_numbers != required:
        raise ValueError(
            f"inconsistencia matemática: universo={total_numbers} requerido={required}"
        )

    rng = secrets.SystemRandom()

    # 1) Universo y shuffle seguro
    universe = list(range(raffle.number_min, raffle.number_max + 1))
    rng.shuffle(universe)

    # 2) Hash de la permutación (auditable, no revela asignación a simple vista)
    seed_hash = hashlib.sha256(
        ",".join(map(str, universe)).encode("utf-8")
    ).hexdigest()

    # 3) Crear las boletas con sus números
    npt = raffle.numbers_per_ticket
    digits = raffle.number_digits
    used_codes: set[str] = set()

    # Padding del label: ancho suficiente para el total de boletas.
    # 500 boletas → 3 dígitos ("001"). 100.000 → 6 dígitos ("000001").
    label_width = max(3, len(str(raffle.total_tickets)))

    new_tickets: list[Ticket] = []
    new_numbers: list[TicketNumber] = []

    for idx in range(raffle.total_tickets):
        label = str(idx + 1).zfill(label_width)

        # Código único de boleta (con re-intento defensivo)
        while True:
            code = _generate_ticket_code(rng)
            if code not in used_codes:
                used_codes.add(code)
                break

        ticket = Ticket(
            raffle_id=raffle.id,
            number_label=label,
            code=code,
            qr_payload=_generate_qr_payload(rng),
            status=TicketStatus.AVAILABLE,
        )
        new_tickets.append(ticket)

    db.add_all(new_tickets)
    await db.flush()  # para obtener ticket.id

    for i, ticket in enumerate(new_tickets):
        start = i * npt
        slice_ = universe[start : start + npt]
        for pos, n in enumerate(slice_, start=1):
            new_numbers.append(
                TicketNumber(
                    raffle_id=raffle.id,
                    ticket_id=ticket.id,
                    number=_format_number(n, digits),
                    position=pos,
                )
            )

    db.add_all(new_numbers)

    # 4) Marcar rifa como bloqueada en lectura
    raffle.numbers_generated = True
    raffle.numbers_generated_at = datetime.now(timezone.utc)
    raffle.numbers_seed = seed_hash
    raffle.status = RaffleStatus.ACTIVE

    await db.flush()
    return raffle
