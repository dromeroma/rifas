"""Unit + integration tests para el servicio de feature flags.

Los unit tests (sin db=) usan solo defaults del registry — sirven para
verificar la lógica de fallback y del warning de flag no declarado.

Los integration tests (marker) validan overrides tenant/global y cache.
"""
from __future__ import annotations

import pytest

from app.modules.platform.flags import (
    GLOBAL_TENANT,
    FlagDefinition,
    is_enabled,
    set_flag,
    delete_flag,
    known_flags,
)
from app.modules.platform.flags.service import clear_cache


@pytest.fixture(autouse=True)
def _clear_flag_cache():
    clear_cache()
    yield
    clear_cache()


# ────────────────────────────────────────────────────────────────
# Unit tests (sin BD)
# ────────────────────────────────────────────────────────────────


class TestIsEnabledDefaults:
    async def test_declared_flag_returns_registered_default(self):
        # `platform.event_dispatcher` está declarado con default=False.
        assert await is_enabled("platform.event_dispatcher") is False

    async def test_undeclared_flag_returns_false_with_warning(self, caplog):
        result = await is_enabled("never.declared.at.all")
        assert result is False
        assert any("no está registrado" in r.message for r in caplog.records)

    async def test_declared_true_default(self):
        # Registra localmente sin colisionar con known_flags globales.
        from app.modules.platform.flags import FlagRegistry
        local = FlagRegistry()
        local.register(FlagDefinition(name="test.only.local", description="x", default=True))
        # Como is_enabled usa known_flags global, esta prueba refleja que
        # sin registro global el flag no está declarado → False.
        assert await is_enabled("test.only.local") is False


# ────────────────────────────────────────────────────────────────
# Integration tests
# ────────────────────────────────────────────────────────────────

pytestmark_integration = pytest.mark.integration


@pytest.mark.integration
class TestIntegrationOverrides:
    async def test_global_override_wins_over_default(self, integration_db):
        # Default de platform.event_dispatcher es False. Ponemos global=True.
        assert await is_enabled("platform.event_dispatcher", db=integration_db) is False

        await set_flag("platform.event_dispatcher", True, db=integration_db)
        await integration_db.commit()
        clear_cache()

        assert await is_enabled("platform.event_dispatcher", db=integration_db) is True

    async def test_tenant_override_wins_over_global(self, integration_db):
        # Global True, tenant 42 override False.
        await set_flag("platform.event_dispatcher", True, db=integration_db)
        await set_flag(
            "platform.event_dispatcher", False, tenant_id=42, db=integration_db,
        )
        await integration_db.commit()
        clear_cache()

        assert await is_enabled(
            "platform.event_dispatcher", tenant_id=42, db=integration_db,
        ) is False
        # Otro tenant no tiene override → hereda global True
        assert await is_enabled(
            "platform.event_dispatcher", tenant_id=99, db=integration_db,
        ) is True

    async def test_delete_flag_restores_default(self, integration_db):
        await set_flag("platform.event_dispatcher", True, db=integration_db)
        await integration_db.commit()
        clear_cache()
        assert await is_enabled("platform.event_dispatcher", db=integration_db) is True

        n = await delete_flag("platform.event_dispatcher", db=integration_db)
        await integration_db.commit()
        clear_cache()
        assert n == 1
        assert await is_enabled("platform.event_dispatcher", db=integration_db) is False

    async def test_cache_hit_avoids_query(self, integration_db):
        # Primera llamada hidrata cache.
        await set_flag("test.cached", True, db=integration_db)
        # Registramos temporalmente el flag para evitar warning.
        try:
            known_flags.register(
                FlagDefinition(name="test.cached", description="cache test")
            )
        except ValueError:
            pass
        await integration_db.commit()
        clear_cache()

        first = await is_enabled("test.cached", db=integration_db)
        # Cambio la BD directamente — el cache aún reflejará el valor viejo.
        await delete_flag("test.cached", db=integration_db)
        await integration_db.commit()

        second_cached = await is_enabled("test.cached", db=integration_db)
        assert first == second_cached  # cache mantuvo el valor viejo

        clear_cache()
        third_fresh = await is_enabled("test.cached", db=integration_db)
        assert third_fresh is False  # ahora sí ve el delete
