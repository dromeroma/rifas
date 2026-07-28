"""Integration tests de los endpoints REST del admin panel de Perks.

Cubre:
  - Flag guard: con perks.admin_api OFF → 404 en todo /api/v1/*.
  - Con flag ON: happy path de customer y rules endpoints.
  - Auth override via dependency_overrides — tests puros del contrato
    HTTP + shape de respuesta.

Requiere DATABASE_URL_TEST.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import get_db
from app.core.deps import TenantScope, get_current_user, get_tenant_scope
from app.models.user import User, UserRole
from app.modules.platform.flags import (
    delete_flag,
    set_flag,
)
from app.modules.platform.flags.service import clear_cache


pytestmark = pytest.mark.integration


PERKS_FLAG = "perks.admin_api"


@pytest_asyncio.fixture
async def tenant_id(integration_db) -> int:
    result = await integration_db.execute(
        text(
            """
            INSERT INTO tenants (name, slug, is_active, created_at, updated_at)
            VALUES ('Perks API Test', 'perks-api-test', true, now(), now())
            RETURNING id
            """
        )
    )
    tid = int(result.scalar_one())
    await integration_db.commit()
    yield tid
    await integration_db.execute(
        text("DELETE FROM tenants WHERE id = :id"), {"id": tid},
    )
    await integration_db.commit()


@pytest_asyncio.fixture
async def fake_admin(tenant_id) -> User:
    """User fake para dependency_override — NO se persiste."""
    u = User(
        id=999_999,
        tenant_id=tenant_id,
        full_name="Fake Admin",
        email="fake@admin.co",
        password_hash="x",
        role=UserRole.ADMIN,
        is_active=True,
    )
    return u


@pytest_asyncio.fixture
async def api_client(
    integration_sessionmaker, integration_db, fake_admin, tenant_id,
):
    """AsyncClient con dependency_overrides listos."""
    from app.main import app

    async def _override_db():
        async with integration_sessionmaker() as db:
            yield db

    async def _override_current_user():
        return fake_admin

    async def _override_tenant_scope():
        return TenantScope(tenant_id=tenant_id, is_super_admin=False)

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_current_user
    app.dependency_overrides[get_tenant_scope] = _override_tenant_scope

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def perks_flag_on(integration_db, tenant_id):
    """Activa el flag perks.admin_api globalmente. Limpia al terminar."""
    await set_flag(PERKS_FLAG, True, db=integration_db)
    await integration_db.commit()
    clear_cache()
    yield
    await delete_flag(PERKS_FLAG, db=integration_db)
    await integration_db.commit()
    clear_cache()


# ────────────────────────────────────────────────────────────────
# Flag guard
# ────────────────────────────────────────────────────────────────


class TestFlagGuard:
    async def test_endpoints_return_404_when_flag_off(self, api_client):
        clear_cache()  # asegura que no vemos un flag cacheado en ON
        for path in [
            "/api/v1/customers",
            "/api/v1/customers/1",
            "/api/v1/rules",
            "/api/v1/rules/1",
        ]:
            resp = await api_client.get(path)
            assert resp.status_code == 404, f"{path}: esperaba 404, dio {resp.status_code}"

    async def test_endpoints_reachable_when_flag_on(
        self, api_client, perks_flag_on,
    ):
        # /api/v1/customers con lista vacía debe dar 200
        resp = await api_client.get("/api/v1/customers")
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["total"] == 0


# ────────────────────────────────────────────────────────────────
# Customer endpoints
# ────────────────────────────────────────────────────────────────


class TestCustomerEndpoints:
    async def test_identify_creates_customer(
        self, api_client, perks_flag_on,
    ):
        resp = await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "juan@test.co"},
                "full_name": "Juan Test",
                "source": "admin_ui",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["first_time"] is True
        assert body["customer_id"] > 0
        assert len(body["identities"]) == 1
        assert body["identities"][0]["kind"] == "email"

        cid = body["customer_id"]

        # get_customer devuelve el detalle
        r2 = await api_client.get(f"/api/v1/customers/{cid}")
        assert r2.status_code == 200
        detail = r2.json()
        assert detail["id"] == cid
        assert detail["full_name"] == "Juan Test"
        assert len(detail["identities"]) == 1

    async def test_list_customers_with_search(
        self, api_client, perks_flag_on,
    ):
        # Crear 3 customers
        await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "ana@test.co"},
                "full_name": "Ana Torres",
            },
        )
        await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "beto@test.co"},
                "full_name": "Beto Duarte",
            },
        )
        await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "carlos@test.co"},
                "full_name": "Carlos Álvarez",
            },
        )

        r = await api_client.get("/api/v1/customers")
        assert r.status_code == 200
        assert r.json()["total"] == 3

        r = await api_client.get("/api/v1/customers?q=torres")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 1
        assert body["items"][0]["full_name"] == "Ana Torres"

    async def test_add_identity_conflict_returns_409(
        self, api_client, perks_flag_on,
    ):
        r = await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "a@a.co"},
                "full_name": "A",
            },
        )
        cid_a = r.json()["customer_id"]

        r = await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "b@b.co"},
                "full_name": "B",
            },
        )
        cid_b = r.json()["customer_id"]

        # Asignar phone a A
        await api_client.post(
            f"/api/v1/customers/{cid_a}/identities",
            json={"kind": "phone", "value": "3001112222"},
        )
        # Intentar asignar el mismo phone a B → 409
        conflict = await api_client.post(
            f"/api/v1/customers/{cid_b}/identities",
            json={"kind": "phone", "value": "3001112222"},
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"]["code"] == "identity_conflict"

    async def test_wallet_snapshot_empty_when_no_wallet(
        self, api_client, perks_flag_on,
    ):
        r = await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "nowallet@test.co"},
                "full_name": "No Wallet",
            },
        )
        cid = r.json()["customer_id"]

        r2 = await api_client.get(f"/api/v1/customers/{cid}/wallet")
        assert r2.status_code == 200
        snap = r2.json()
        assert snap["customer_id"] == cid
        assert snap["balances"] == []
        assert snap["active_vouchers"] == 0


# ────────────────────────────────────────────────────────────────
# Rules endpoints
# ────────────────────────────────────────────────────────────────


class TestRulesEndpoints:
    def _welcome_rule_payload(self, code: str = "welcome") -> dict:
        return {
            "code": code,
            "definition": {
                "name": "Bienvenida 100 pts",
                "trigger": {"event": "customer.identified"},
                "conditions": {
                    "all": [
                        {"path": "data.first_time", "op": "eq", "value": True},
                    ],
                },
                "actions": [
                    {
                        "type": "wallet.credit_points",
                        "params": {"amount": 100, "reason": "welcome"},
                    },
                ],
            },
        }

    async def test_create_get_list_rule(self, api_client, perks_flag_on):
        r = await api_client.post(
            "/api/v1/rules", json=self._welcome_rule_payload(),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["code"] == "welcome"
        assert body["enabled"] is True
        rid = body["id"]

        r2 = await api_client.get(f"/api/v1/rules/{rid}")
        assert r2.status_code == 200
        detail = r2.json()
        assert detail["rule"]["id"] == rid
        assert detail["active_dsl"]["trigger"]["event"] == "customer.identified"

        r3 = await api_client.get("/api/v1/rules")
        assert r3.status_code == 200
        assert r3.json()["total"] == 1

    async def test_duplicate_code_returns_409(
        self, api_client, perks_flag_on,
    ):
        await api_client.post(
            "/api/v1/rules", json=self._welcome_rule_payload(code="w1"),
        )
        r = await api_client.post(
            "/api/v1/rules", json=self._welcome_rule_payload(code="w1"),
        )
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "duplicate_rule_code"

    async def test_unknown_action_returns_422(
        self, api_client, perks_flag_on,
    ):
        bad = self._welcome_rule_payload(code="bad")
        bad["definition"]["actions"] = [
            {"type": "notregistered.at.all", "params": {}},
        ]
        r = await api_client.post("/api/v1/rules", json=bad)
        assert r.status_code == 422
        assert r.json()["detail"]["code"] == "unknownaction"

    async def test_disable_and_enable(self, api_client, perks_flag_on):
        r = await api_client.post(
            "/api/v1/rules", json=self._welcome_rule_payload(code="toggle"),
        )
        rid = r.json()["id"]

        r2 = await api_client.post(f"/api/v1/rules/{rid}/disable")
        assert r2.status_code == 200
        assert r2.json()["enabled"] is False

        r3 = await api_client.post(f"/api/v1/rules/{rid}/enable")
        assert r3.status_code == 200
        assert r3.json()["enabled"] is True

    async def test_dry_run(self, api_client, perks_flag_on):
        r = await api_client.post(
            "/api/v1/rules", json=self._welcome_rule_payload(code="dry"),
        )
        rid = r.json()["id"]

        # Crear customer para el dry-run
        cid_resp = await api_client.post(
            "/api/v1/customers/identify",
            json={
                "identity": {"kind": "email", "value": "dry@test.co"},
                "full_name": "Dry",
            },
        )
        cid = cid_resp.json()["customer_id"]

        r2 = await api_client.post(
            f"/api/v1/rules/{rid}/dry-run",
            json={
                "event_type": "customer.identified",
                "event_data": {"first_time": True},
                "customer_id": cid,
            },
        )
        assert r2.status_code == 200
        body = r2.json()
        assert body["matched_conditions"] is True
        assert body["status"] == "fired"
        assert len(body["actions_planned"]) == 1
        assert body["actions_planned"][0]["type"] == "wallet.credit_points"

    async def test_update_creates_new_version(
        self, api_client, perks_flag_on,
    ):
        r = await api_client.post(
            "/api/v1/rules", json=self._welcome_rule_payload(code="upd"),
        )
        rid = r.json()["id"]
        old_version = r.json()["active_version_id"]

        new_def = self._welcome_rule_payload(code="upd")["definition"]
        new_def["actions"][0]["params"]["amount"] = 200

        r2 = await api_client.put(
            f"/api/v1/rules/{rid}",
            json={"definition": new_def, "change_note": "subir bono"},
        )
        assert r2.status_code == 200
        assert r2.json()["active_version_id"] != old_version
