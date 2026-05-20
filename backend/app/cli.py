"""CLI utilitaria. Uso: python -m app.cli <comando>"""

import asyncio
import getpass
import sys
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.prize import Prize
from app.models.raffle import Raffle
from app.models.user import User, UserRole


async def create_superadmin() -> None:
    email = input("Email del super admin: ").strip()
    full_name = input("Nombre completo: ").strip()
    password = getpass.getpass("Contraseña: ")
    if len(password) < 8:
        print("contraseña muy corta (min 8)")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            print("ya existe un usuario con ese email")
            return
        user = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(password),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print(f"super admin creado: id={user.id}")


async def seed_tv_raffle() -> None:
    """Crea la rifa inicial: TV 50'' + 3 bonos de $200.000."""
    today = date.today()
    final_draw = today + timedelta(days=90)

    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(select(Raffle).where(Raffle.name == "Gran Rifa del Televisor"))
        ).scalar_one_or_none()
        if existing:
            print(f"la rifa ya existe (id={existing.id})")
            return

        raffle = Raffle(
            name="Gran Rifa del Televisor",
            description="Rifa con 4 sorteos: 3 bonos de $200.000 y un televisor de 50''.",
            total_tickets=500,
            numbers_per_ticket=20,
            number_min=0,
            number_max=9999,
            number_digits=4,
            ticket_price=Decimal("20000"),
            seller_commission=Decimal("3000"),
            final_draw_date=final_draw,
            primary_color="#1b8b3b",
        )
        db.add(raffle)
        await db.flush()

        prizes = [
            Prize(raffle_id=raffle.id, position=1, name="Bono $200.000 #1",
                  estimated_value=Decimal("200000"), draw_date=today + timedelta(days=30)),
            Prize(raffle_id=raffle.id, position=2, name="Bono $200.000 #2",
                  estimated_value=Decimal("200000"), draw_date=today + timedelta(days=50)),
            Prize(raffle_id=raffle.id, position=3, name="Bono $200.000 #3",
                  estimated_value=Decimal("200000"), draw_date=today + timedelta(days=70)),
            Prize(raffle_id=raffle.id, position=4, name="Televisor 50''",
                  estimated_value=Decimal("1800000"), draw_date=final_draw),
        ]
        db.add_all(prizes)
        await db.commit()
        print(f"rifa creada id={raffle.id} con {len(prizes)} premios. "
              f"Ejecuta luego: POST /raffles/{raffle.id}/generate-numbers")


COMMANDS = {
    "create-superadmin": create_superadmin,
    "seed-tv-raffle": seed_tv_raffle,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print("Uso: python -m app.cli <comando>")
        print("Comandos:")
        for c in COMMANDS:
            print(f"  - {c}")
        sys.exit(1)
    asyncio.run(COMMANDS[sys.argv[1]]())


if __name__ == "__main__":
    main()
