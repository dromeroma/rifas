"""
Worker independiente: expira reservas vencidas cada N segundos.
Levantarlo con: python -m app.worker
"""

import asyncio
import logging

from app.core.database import AsyncSessionLocal
from app.services.reservation_service import expire_overdue

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("worker")


async def main(interval: int = 60):
    log.info("worker iniciado — intervalo=%ss", interval)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                released = await expire_overdue(db)
                if released:
                    log.info("reservas expiradas liberadas: %d", released)
        except Exception:
            log.exception("error procesando expiraciones")
        await asyncio.sleep(interval)


if __name__ == "__main__":
    asyncio.run(main())
