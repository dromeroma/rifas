"""Handlers del bus del módulo wallet.

Registra suscripciones a eventos de OTROS módulos que requieren
efectos en wallet. Cada handler es idempotente y respeta las reglas
de handlers de docs/04-EVENTS.md.

Handlers actuales:

  wallet.create_on_customer_identified
      Suscrito a `customer.identified`. Cuando un customer se
      identifica por primera vez, crea automáticamente su wallet.
      Idempotente por find_or_create — múltiples entregas del mismo
      evento no crean wallets duplicados.

Este archivo se importa al arrancar la aplicación (ver
app/modules/_handlers.py) para que los `@registry.on(...)` se
ejecuten y las suscripciones queden vivas.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.modules.customer import events as customer_events
from app.modules.platform.events import Actor, ActorKind, Event, registry
from app.modules.wallet.service import find_or_create

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@registry.on(
    customer_events.CUSTOMER_IDENTIFIED,
    handler_id="wallet.create_on_customer_identified",
)
async def create_wallet_on_customer_identified(
    event: Event, db: "AsyncSession",
) -> None:
    """Crea la wallet cuando un customer se identifica por primera vez.

    Extrae customer_id del subject del evento. Idempotente: si la
    wallet ya existe, `find_or_create` la devuelve sin duplicar ni
    reemitir wallet.created.

    Propaga context.trigger_event_id → la wallet.created queda
    encadenada a la customer.identified original.
    """
    if event.tenant_id is None:
        logger.warning(
            "customer.identified sin tenant_id — skip creación wallet (event %s)",
            event.id,
        )
        return

    customer_id_raw = event.subject.id
    if customer_id_raw is None:
        logger.warning(
            "customer.identified sin subject.id — skip creación wallet (event %s)",
            event.id,
        )
        return

    try:
        customer_id = int(customer_id_raw)
    except (TypeError, ValueError):
        logger.warning(
            "customer.identified con subject.id no numérico %r — skip (event %s)",
            customer_id_raw,
            event.id,
        )
        return

    await find_or_create(
        db,
        tenant_id=event.tenant_id,
        customer_id=customer_id,
        actor=Actor(kind=ActorKind.SYSTEM),
        trigger_event_id=event.id,
    )
