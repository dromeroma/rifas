"""Fixtures compartidos para toda la suite de tests.

Convención:
  - Tests unitarios: no dependen de BD ni de env vars. Corren siempre.
  - Tests de integración: marcados con `@pytest.mark.integration`.
    Requieren `DATABASE_URL_TEST` apuntando a un Postgres dedicado
    (idealmente una BD desechable local, NO producción).
    Se saltean automáticamente si la env no está.

Uso típico:
    pytest -q                       # solo unit
    pytest -q -m integration        # solo integración
    DATABASE_URL_TEST=... pytest    # todo
"""
from __future__ import annotations

import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.database import Base
from app.modules import _alembic_metadata  # noqa: F401 — registra modelos


TEST_DB_ENV = "DATABASE_URL_TEST"


def pytest_collection_modifyitems(config, items):
    """Saltea tests marcados @integration si no hay DATABASE_URL_TEST."""
    if os.getenv(TEST_DB_ENV):
        return
    skip_int = pytest.mark.skip(
        reason=f"integración desactivada — setear {TEST_DB_ENV} para ejecutar"
    )
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_int)


@pytest_asyncio.fixture(scope="session")
async def integration_engine():
    """Engine dedicado para tests de integración.

    Crea/dropea el schema completo al inicio/fin de la sesión.
    Postgres real es obligatorio (usamos JSONB, ON CONFLICT y SKIP LOCKED).
    """
    url = os.getenv(TEST_DB_ENV)
    if not url:
        pytest.skip(f"{TEST_DB_ENV} no configurada")

    engine = create_async_engine(url, pool_pre_ping=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def integration_sessionmaker(integration_engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        integration_engine, class_=AsyncSession, expire_on_commit=False, autoflush=False,
    )


@pytest_asyncio.fixture
async def integration_db(
    integration_sessionmaker: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncSession, None]:
    """Sesión limpia por test. Trunca tablas del bus al terminar."""
    async with integration_sessionmaker() as db:
        yield db
        # Limpieza aditiva — solo las tablas del bus (por ahora).
        await db.rollback()
        from sqlalchemy import text as sql_text

        await db.execute(sql_text("TRUNCATE event_outbox RESTART IDENTITY CASCADE"))
        await db.execute(sql_text("TRUNCATE event_handled CASCADE"))
        # customer module — CASCADE limpia identities/preferences/consents
        # y también las filas de la tabla customers legacy que dependan.
        await db.execute(
            sql_text("TRUNCATE customer_identities RESTART IDENTITY CASCADE")
        )
        await db.execute(
            sql_text("TRUNCATE customer_preferences RESTART IDENTITY CASCADE")
        )
        await db.execute(
            sql_text("TRUNCATE customer_consents RESTART IDENTITY CASCADE")
        )
        # wallet module — CASCADE limpia balances/ledger/vouchers.
        await db.execute(sql_text("TRUNCATE wallets RESTART IDENTITY CASCADE"))
        await db.execute(
            sql_text("TRUNCATE wallet_balances RESTART IDENTITY CASCADE")
        )
        await db.execute(
            sql_text("TRUNCATE wallet_ledger RESTART IDENTITY CASCADE")
        )
        await db.execute(
            sql_text("TRUNCATE wallet_vouchers RESTART IDENTITY CASCADE")
        )
        await db.commit()
