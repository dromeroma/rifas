"""Integration tests del service de customer.

Requiere DATABASE_URL_TEST. Se saltan sin ella.

Cubre el flujo completo end-to-end:
  - identify() find-or-create con identities adicionales.
  - Event `customer.identified` va al outbox solo en first_time.
  - add_identity idempotente y con conflict.
  - verify_identity emite evento solo la primera vez.
  - set_preference upsert.
  - grant/revoke consent append-only + eventos correctos.
  - find_by_identity con normalización tolerante.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.modules.customer import (
    ConsentAction,
    IdentifyRequest,
    IdentityConflictError,
    IdentityIn,
    IdentityKind,
    NotificationChannel,
    add_identity,
    events as customer_events,
    find_by_identity,
    get_preferences,
    grant_consent,
    identify,
    latest_consent,
    list_identities,
    revoke_consent,
    set_preference,
    verify_identity,
)
from app.modules.platform.events import Actor, ActorKind
from app.modules.platform.events.models import EventOutbox


pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    """Crea un tenant vacío para los tests. Devuelve su id."""
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Test Tenant', 'test-tenant', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tid})
    await integration_db.commit()


def _actor(kind=ActorKind.SYSTEM):
    return Actor(kind=kind)


async def _outbox_types_for(db, customer_id: int) -> list[str]:
    """Lee tipos de eventos emitidos con subject=customer:id ordenados."""
    stmt = (
        select(EventOutbox.type)
        .where(EventOutbox.subject["kind"].astext == "customer")
        .where(EventOutbox.subject["id"].astext == str(customer_id))
        .order_by(EventOutbox.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


class TestIdentifyCreatesCustomer:
    async def test_first_time_creates_customer_and_identity(
        self, integration_db, tenant_id
    ):
        req = IdentifyRequest(
            identity=IdentityIn(kind=IdentityKind.EMAIL, value="Ana@Mail.com"),
            full_name="Ana Pérez",
            source="landing_form",
        )
        result = await identify(
            integration_db, tenant_id=tenant_id, actor=_actor(), request=req,
        )
        await integration_db.commit()

        assert result.first_time is True
        assert result.customer_id > 0
        assert len(result.identities) == 1
        assert result.identities[0].kind is IdentityKind.EMAIL
        assert result.identities[0].value == "Ana@Mail.com"

        types = await _outbox_types_for(integration_db, result.customer_id)
        assert customer_events.CUSTOMER_IDENTIFIED in types

    async def test_second_call_same_identity_returns_existing(
        self, integration_db, tenant_id
    ):
        # normalización — mayúsculas y espacios distintos, mismo email
        req1 = IdentifyRequest(
            identity=IdentityIn(kind=IdentityKind.EMAIL, value="Ana@Mail.com"),
            full_name="Ana Pérez",
        )
        first = await identify(
            integration_db, tenant_id=tenant_id, actor=_actor(), request=req1,
        )
        await integration_db.commit()

        req2 = IdentifyRequest(
            identity=IdentityIn(kind=IdentityKind.EMAIL, value="  ANA@mail.COM  "),
        )
        second = await identify(
            integration_db, tenant_id=tenant_id, actor=_actor(), request=req2,
        )
        await integration_db.commit()

        assert second.customer_id == first.customer_id
        assert second.first_time is False

        # customer.identified debería emitirse una sola vez.
        types = await _outbox_types_for(integration_db, first.customer_id)
        assert types.count(customer_events.CUSTOMER_IDENTIFIED) == 1

    async def test_additional_identities_registered(
        self, integration_db, tenant_id
    ):
        req = IdentifyRequest(
            identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            full_name="Ana",
            additional_identities=[
                IdentityIn(kind=IdentityKind.PHONE, value="+57 300 111 2222"),
                IdentityIn(kind=IdentityKind.DOCUMENT, value="12.345.678"),
            ],
        )
        result = await identify(
            integration_db, tenant_id=tenant_id, actor=_actor(), request=req,
        )
        await integration_db.commit()

        kinds = {i.kind for i in result.identities}
        assert kinds == {
            IdentityKind.EMAIL,
            IdentityKind.PHONE,
            IdentityKind.DOCUMENT,
        }
        types = await _outbox_types_for(integration_db, result.customer_id)
        # 1 identified + 2 identity.added (adicionales)
        assert types.count(customer_events.CUSTOMER_IDENTITY_ADDED) == 2


class TestAddIdentity:
    async def test_add_new_identity(self, integration_db, tenant_id):
        seed = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            ),
        )
        await integration_db.commit()

        identity = await add_identity(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            kind=IdentityKind.PHONE,
            value="+57 300 999 8888",
            actor=_actor(),
        )
        await integration_db.commit()

        assert identity.customer_id == seed.customer_id
        assert identity.value_normalized == "573009998888"

    async def test_add_same_identity_is_idempotent(
        self, integration_db, tenant_id,
    ):
        seed = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            ),
        )
        await integration_db.commit()

        i1 = await add_identity(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            kind=IdentityKind.PHONE,
            value="3001112222",
            actor=_actor(),
        )
        i2 = await add_identity(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            kind=IdentityKind.PHONE,
            value="3001112222",
            actor=_actor(),
        )
        await integration_db.commit()

        assert i1.id == i2.id

    async def test_add_identity_conflict(self, integration_db, tenant_id):
        # Dos customers distintos con misma phone → error al segundo.
        a = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            ),
        )
        b = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="b@b.co"),
            ),
        )
        await integration_db.commit()

        await add_identity(
            integration_db,
            tenant_id=tenant_id,
            customer_id=a.customer_id,
            kind=IdentityKind.PHONE,
            value="3001112222",
            actor=_actor(),
        )
        await integration_db.commit()

        with pytest.raises(IdentityConflictError) as exc_info:
            await add_identity(
                integration_db,
                tenant_id=tenant_id,
                customer_id=b.customer_id,
                kind=IdentityKind.PHONE,
                value="3001112222",
                actor=_actor(),
            )
        assert exc_info.value.existing_customer_id == a.customer_id
        assert exc_info.value.attempted_customer_id == b.customer_id


class TestVerifyIdentity:
    async def test_verify_emits_event_first_time_only(
        self, integration_db, tenant_id,
    ):
        seed = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            ),
        )
        await integration_db.commit()

        identities = await list_identities(
            integration_db, tenant_id=tenant_id, customer_id=seed.customer_id,
        )
        target = identities[0]
        assert target.verified is False

        await verify_identity(
            integration_db, identity=target, source="otp_email", actor=_actor(),
        )
        await verify_identity(
            integration_db, identity=target, source="otp_email", actor=_actor(),
        )
        await integration_db.commit()

        types = await _outbox_types_for(integration_db, seed.customer_id)
        # exactamente 1 verified event
        assert types.count(customer_events.CUSTOMER_IDENTITY_VERIFIED) == 1


class TestFindByIdentity:
    async def test_normalization_tolerant(self, integration_db, tenant_id):
        seed = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="Ana@Mail.com"),
            ),
        )
        await integration_db.commit()

        # el caller pasa valor con variaciones — debe encontrarlo igual.
        found = await find_by_identity(
            integration_db,
            tenant_id=tenant_id,
            kind=IdentityKind.EMAIL,
            value="  ANA@mail.COM ",
        )
        assert found == seed.customer_id

    async def test_missing_returns_none(self, integration_db, tenant_id):
        found = await find_by_identity(
            integration_db,
            tenant_id=tenant_id,
            kind=IdentityKind.EMAIL,
            value="nadie@aqui.co",
        )
        assert found is None


class TestPreferences:
    async def test_set_and_get(self, integration_db, tenant_id):
        seed = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            ),
        )
        await integration_db.commit()

        await set_preference(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            channel=NotificationChannel.WHATSAPP,
            allowed=True,
        )
        await set_preference(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            channel=NotificationChannel.WHATSAPP,
            allowed=False,
            settings={"reason": "user_optout"},
        )
        await integration_db.commit()

        prefs = await get_preferences(
            integration_db, tenant_id=tenant_id, customer_id=seed.customer_id,
        )
        assert len(prefs) == 1
        assert prefs[0].allowed is False
        assert prefs[0].settings == {"reason": "user_optout"}


class TestConsents:
    async def test_grant_then_revoke_append_only(
        self, integration_db, tenant_id,
    ):
        seed = await identify(
            integration_db,
            tenant_id=tenant_id,
            actor=_actor(),
            request=IdentifyRequest(
                identity=IdentityIn(kind=IdentityKind.EMAIL, value="a@b.co"),
            ),
        )
        await integration_db.commit()

        await grant_consent(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            purpose="marketing",
            source="landing_form",
            policy_version="2026-Q3",
        )
        await revoke_consent(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            purpose="marketing",
            source="account_settings",
        )
        await integration_db.commit()

        latest = await latest_consent(
            integration_db,
            tenant_id=tenant_id,
            customer_id=seed.customer_id,
            purpose="marketing",
        )
        assert latest is not None
        assert latest.action is ConsentAction.REVOKED

        types = await _outbox_types_for(integration_db, seed.customer_id)
        assert customer_events.CUSTOMER_CONSENT_GRANTED in types
        assert customer_events.CUSTOMER_CONSENT_REVOKED in types
