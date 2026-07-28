"""End-to-end test del event bus interno.

Escenario: se llama a customer.identify() → el bus recibe
customer.identified → el dispatcher lo despacha → el handler del
módulo wallet se ejecuta → la wallet queda creada.

Es la primera prueba viviente de que el bus funciona cross-módulo
sin acoplamiento directo entre customer y wallet. Todo el
acoplamiento pasa por eventos + registry.

Requiere DATABASE_URL_TEST.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.customer import (
    IdentifyRequest,
    IdentityIn,
    IdentityKind,
    identify,
)
from app.modules.customer import events as customer_events
from app.modules.platform.events import Actor, ActorKind
from app.modules.platform.events.bus import registry
from app.modules.platform.events.dispatcher import Dispatcher, DispatcherConfig
from app.modules.platform.events.models import (
    EventHandled,
    EventOutbox,
    HandledStatus,
    OutboxStatus,
)
from app.modules.wallet import Wallet, events as wallet_events, find
from app.modules.wallet.handlers import create_wallet_on_customer_identified


pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _wire_wallet_handler():
    """Registra el handler wallet.create_on_customer_identified.

    El import de `app.modules.wallet.handlers` normalmente registra el
    handler por side-effect. En tests que corren dispatcher tests
    antes que limpian el registry, forzamos re-registro explícito
    aquí para robustez.
    """
    # Aseguramos un estado limpio y volvemos a registrar.
    registry.clear()
    registry.on(
        customer_events.CUSTOMER_IDENTIFIED,
        handler_id="wallet.create_on_customer_identified",
    )(create_wallet_on_customer_identified)
    yield
    registry.clear()


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('E2E Bus Tenant', 'e2e-bus', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


def _fast_config() -> DispatcherConfig:
    return DispatcherConfig(
        poll_interval=0.01, batch_size=10, max_handler_attempts=3,
    )


class TestEndToEndBus:
    async def test_identify_customer_triggers_wallet_creation(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        # Paso 1: identify emite customer.identified al outbox.
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="e2e@bus.co"),
                full_name="Cliente E2E",
                source="e2e_test",
            ),
        )
        await integration_db.commit()

        customer_id = result.customer_id

        # Confirmamos que existe el evento en el outbox y NO hay wallet aún.
        outbox_before = list(
            (
                await integration_db.execute(
                    select(EventOutbox)
                    .where(EventOutbox.type == customer_events.CUSTOMER_IDENTIFIED)
                    .where(EventOutbox.subject["id"].astext == str(customer_id))
                )
            )
            .scalars()
            .all()
        )
        assert len(outbox_before) == 1
        assert outbox_before[0].status == OutboxStatus.PENDING

        assert await find(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        ) is None

        # Paso 2: dispatcher toma el evento y despacha al handler.
        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        processed = await dispatcher.tick()
        assert processed >= 1

        # Paso 3: la wallet debe existir ahora.
        wallet = await find(
            integration_db, tenant_id=tenant_id, customer_id=customer_id,
        )
        assert wallet is not None, "el handler debía crear la wallet"

        # Paso 4: el evento customer.identified quedó DISPATCHED.
        outbox_after = (
            await integration_db.execute(
                select(EventOutbox).where(
                    EventOutbox.id == outbox_before[0].id
                )
            )
        ).scalar_one()
        assert outbox_after.status == OutboxStatus.DISPATCHED

        # Paso 5: event_handled registra SUCCESS del handler.
        handled = (
            await integration_db.execute(
                select(EventHandled).where(
                    EventHandled.event_id == outbox_before[0].event_id
                )
            )
        ).scalars().all()
        handled_list = list(handled)
        assert len(handled_list) == 1
        assert handled_list[0].handler_id == "wallet.create_on_customer_identified"
        assert handled_list[0].status == HandledStatus.SUCCESS

        # Paso 6: el evento wallet.created lleva el trigger correcto —
        # traza de causalidad completa del bus.
        wallet_created_rows = list(
            (
                await integration_db.execute(
                    select(EventOutbox)
                    .where(EventOutbox.type == wallet_events.WALLET_CREATED)
                    .where(EventOutbox.subject["id"].astext == str(wallet.id))
                )
            )
            .scalars()
            .all()
        )
        assert len(wallet_created_rows) == 1
        wallet_created = wallet_created_rows[0]
        assert wallet_created.context.get("trigger_event_id") == outbox_before[0].event_id

    async def test_idempotent_dispatch_creates_only_one_wallet(
        self, integration_sessionmaker, integration_db, tenant_id,
    ):
        # Identificamos, corremos tick 1: wallet creada.
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="idempo@bus.co"),
                full_name="Idempo",
            ),
        )
        await integration_db.commit()

        dispatcher = Dispatcher(integration_sessionmaker, config=_fast_config())
        await dispatcher.tick()

        # Volvemos a marcar el outbox como PENDING para forzar re-dispatch.
        outbox_row = (
            await integration_db.execute(
                select(EventOutbox)
                .where(EventOutbox.type == customer_events.CUSTOMER_IDENTIFIED)
                .where(EventOutbox.subject["id"].astext == str(result.customer_id))
            )
        ).scalar_one()
        outbox_row.status = OutboxStatus.PENDING
        outbox_row.dispatched_at = None
        await integration_db.commit()

        # Segundo tick: como el handler quedó SUCCESS en event_handled,
        # NO se re-ejecuta (idempotencia del bus + find_or_create del
        # handler haría no-op incluso si se ejecutara).
        await dispatcher.tick()

        # Solo hay una wallet.
        wallets = list(
            (
                await integration_db.execute(
                    select(Wallet).where(
                        Wallet.tenant_id == tenant_id,
                        Wallet.customer_id == result.customer_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(wallets) == 1

        # Y solo un evento wallet.created (no dupli).
        wallet_created_count = (
            await integration_db.execute(
                select(EventOutbox)
                .where(EventOutbox.type == wallet_events.WALLET_CREATED)
                .where(EventOutbox.subject["id"].astext == str(wallets[0].id))
            )
        ).scalars().all()
        assert len(list(wallet_created_count)) == 1
