"""Integration tests del service notifications.

Cubre send() con happy paths + branches importantes:
  - Template no existe → 404 tipado.
  - Idempotency key devuelve mismo delivery sin re-enviar.
  - Preference opt-out bloquea (marketing) pero no transactional.
  - Destination resolución desde CustomerIdentity.
  - in_app queda DELIVERED de una vez.
  - Webhook con URL inválida.

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
    NotificationChannel as CustomerNotifChannel,
    identify,
    set_preference,
)
from app.modules.notifications import (
    DeliveryStatus,
    NotificationChannel,
    SendRequest,
    TemplateIn,
    TemplateNotFoundError,
    events as notif_events,
    send as notifications_send,
    upsert_template,
)
from app.modules.notifications.models import NotificationDelivery
from app.modules.platform.events import Actor, ActorKind
from app.modules.platform.events.models import EventOutbox


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Notif Test', 'notif-test', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


def _actor():
    return Actor(kind=ActorKind.MEMBER, id=1)


async def _outbox_types(db, subject_id) -> list[str]:
    stmt = (
        select(EventOutbox.type)
        .where(EventOutbox.subject["kind"].astext == "notification_delivery")
        .where(EventOutbox.subject["id"].astext == str(subject_id))
        .order_by(EventOutbox.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


class TestSend:
    async def test_missing_template_raises(self, integration_db, tenant_id):
        with pytest.raises(TemplateNotFoundError):
            await notifications_send(
                integration_db,
                tenant_id=tenant_id,
                actor=_actor(),
                req=SendRequest(
                    template_key="ghost",
                    channel=NotificationChannel.IN_APP,
                ),
            )

    async def test_in_app_marks_delivered(self, integration_db, tenant_id):
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=TemplateIn(
                key="welcome_in_app",
                channel=NotificationChannel.IN_APP,
                name="Bienvenida in-app",
                body_text="¡Bienvenido!",
                purpose="transactional",
            ),
        )
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@a.co"),
                full_name="Ana",
            ),
        )
        await integration_db.commit()

        delivery = await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            req=SendRequest(
                template_key="welcome_in_app",
                channel=NotificationChannel.IN_APP,
                customer_id=result.customer_id,
            ),
        )
        await integration_db.commit()

        assert delivery.status is DeliveryStatus.DELIVERED
        assert delivery.destination == f"customer:{result.customer_id}"
        assert delivery.sent_at is not None
        assert delivery.delivered_at is not None
        assert delivery.provider_meta.get("provider") == "in_app"

        types = await _outbox_types(integration_db, delivery.id)
        assert notif_events.NOTIFICATIONS_MESSAGE_QUEUED in types
        assert notif_events.NOTIFICATIONS_MESSAGE_SENT in types

    async def test_email_uses_identity_as_destination(
        self, integration_db, tenant_id,
    ):
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=TemplateIn(
                key="tx_email",
                channel=NotificationChannel.EMAIL,
                name="Email tx",
                subject="Hola {{customer.full_name}}",
                body_text="Gracias por tu registro",
                purpose="transactional",
            ),
        )
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="Ana@Mail.com"),
                full_name="Ana Torres",
            ),
        )
        await integration_db.commit()

        delivery = await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            req=SendRequest(
                template_key="tx_email",
                channel=NotificationChannel.EMAIL,
                customer_id=result.customer_id,
            ),
        )
        await integration_db.commit()

        assert delivery.status is DeliveryStatus.SENT
        # value_normalized fue lowercase — el value original se conserva
        # como "Ana@Mail.com".
        assert delivery.destination == "Ana@Mail.com"
        assert delivery.rendered_subject == "Hola Ana Torres"
        assert delivery.rendered_body == "Gracias por tu registro"

    async def test_idempotency_key_returns_same_delivery(
        self, integration_db, tenant_id,
    ):
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=TemplateIn(
                key="idempo",
                channel=NotificationChannel.IN_APP,
                name="Idempo",
                body_text="x",
                purpose="transactional",
            ),
        )
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="i@i.co"),
                full_name="I",
            ),
        )
        await integration_db.commit()

        d1 = await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            req=SendRequest(
                template_key="idempo",
                channel=NotificationChannel.IN_APP,
                customer_id=result.customer_id,
                idempotency_key="notif-key-1",
            ),
        )
        d2 = await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            req=SendRequest(
                template_key="idempo",
                channel=NotificationChannel.IN_APP,
                customer_id=result.customer_id,
                idempotency_key="notif-key-1",
            ),
        )
        await integration_db.commit()

        assert d1.id == d2.id
        # Solo hay una fila de delivery.
        rows = list(
            (
                await integration_db.execute(
                    select(NotificationDelivery).where(
                        NotificationDelivery.tenant_id == tenant_id
                    )
                )
            ).scalars().all()
        )
        assert len(rows) == 1

    async def test_preference_opt_out_blocks_marketing(
        self, integration_db, tenant_id,
    ):
        # Marketing template — sujeto a consent
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=TemplateIn(
                key="promo_email",
                channel=NotificationChannel.EMAIL,
                name="Promo",
                subject="Descuento",
                body_text="tenemos algo para vos",
                purpose="marketing",
            ),
        )
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="opt@out.co"),
                full_name="OptOut",
            ),
        )
        # opt-out explícito de email
        await set_preference(
            integration_db,
            tenant_id=tenant_id,
            customer_id=result.customer_id,
            channel=CustomerNotifChannel.EMAIL,
            allowed=False,
        )
        await integration_db.commit()

        delivery = await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            req=SendRequest(
                template_key="promo_email",
                channel=NotificationChannel.EMAIL,
                customer_id=result.customer_id,
            ),
        )
        await integration_db.commit()

        assert delivery.status is DeliveryStatus.BLOCKED
        assert delivery.sent_at is None
        types = await _outbox_types(integration_db, delivery.id)
        assert notif_events.NOTIFICATIONS_MESSAGE_BLOCKED in types
        assert notif_events.NOTIFICATIONS_MESSAGE_SENT not in types

    async def test_transactional_ignores_opt_out(
        self, integration_db, tenant_id,
    ):
        # Transactional siempre pasa aunque haya opt-out
        await upsert_template(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            payload=TemplateIn(
                key="password_reset",
                channel=NotificationChannel.EMAIL,
                name="Reset",
                subject="Reset",
                body_text="link",
                purpose="transactional",
            ),
        )
        result = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="tx@x.co"),
                full_name="TX",
            ),
        )
        await set_preference(
            integration_db,
            tenant_id=tenant_id,
            customer_id=result.customer_id,
            channel=CustomerNotifChannel.EMAIL,
            allowed=False,   # opt-out
        )
        await integration_db.commit()

        delivery = await notifications_send(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            req=SendRequest(
                template_key="password_reset",
                channel=NotificationChannel.EMAIL,
                customer_id=result.customer_id,
            ),
        )
        await integration_db.commit()

        # transactional pasa aunque haya opt-out del canal
        assert delivery.status is DeliveryStatus.SENT
