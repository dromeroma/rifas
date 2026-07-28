"""Servicio de feature flags.

Semántica de resolución de `is_enabled(name, tenant_id=None)`:

  1. Si existe fila para (tenant_id, name) → usa ese `enabled`.
  2. Si existe fila global (tenant_id IS NULL) para `name` → usa ese.
  3. Si el flag está declarado en `known_flags` → usa su default.
  4. Si el flag no está declarado en ningún lado → False + warning.

Cache in-process con TTL corto (5s) para reducir queries. El cache es
best-effort — cambios manuales en BD se reflejan en <5s.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Mapping
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.flags.models import FeatureFlag
from app.modules.platform.flags.registry import GLOBAL_TENANT, known_flags

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────
# Cache in-process (TTL corto)
# ────────────────────────────────────────────────────────────────

_CACHE_TTL_SECONDS = 5.0

# (tenant_id, name) → (bool, expires_at_monotonic)
_cache: dict[tuple[int | None, str], tuple[bool, float]] = {}


def _cache_get(key: tuple[int | None, str]) -> bool | None:
    hit = _cache.get(key)
    if hit is None:
        return None
    value, expires_at = hit
    if time.monotonic() >= expires_at:
        _cache.pop(key, None)
        return None
    return value


def _cache_set(key: tuple[int | None, str], value: bool) -> None:
    _cache[key] = (value, time.monotonic() + _CACHE_TTL_SECONDS)


def clear_cache() -> None:
    """Limpia el cache in-process. Uso: tests + operaciones de admin."""
    _cache.clear()


# ────────────────────────────────────────────────────────────────
# API pública
# ────────────────────────────────────────────────────────────────


async def is_enabled(
    name: str,
    *,
    tenant_id: int | None = None,
    db: AsyncSession | None = None,
) -> bool:
    """True si el flag está activo para el tenant (o globalmente).

    Si `db` es None, resuelve solo con los defaults del registry —
    útil en tests y en cold start antes de conectar a la BD.
    """
    key = (tenant_id, name)
    cached = _cache_get(key)
    if cached is not None:
        return cached

    if db is None:
        default = known_flags.default_for(name)
        if known_flags.get(name) is None:
            logger.warning(
                "flag %r no está registrado en known_flags — retornando False",
                name,
            )
        _cache_set(key, default)
        return default

    # 1) override por tenant
    if tenant_id is not None:
        row = (
            await db.execute(
                select(FeatureFlag).where(
                    FeatureFlag.tenant_id == tenant_id,
                    FeatureFlag.name == name,
                )
            )
        ).scalar_one_or_none()
        if row is not None:
            _cache_set(key, row.enabled)
            return row.enabled

    # 2) global
    row = (
        await db.execute(
            select(FeatureFlag).where(
                FeatureFlag.tenant_id.is_(None),
                FeatureFlag.name == name,
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        _cache_set(key, row.enabled)
        return row.enabled

    # 3) default del registry
    default = known_flags.default_for(name)
    if known_flags.get(name) is None:
        logger.warning(
            "flag %r no está registrado en known_flags — retornando False",
            name,
        )
    _cache_set(key, default)
    return default


async def set_flag(
    name: str,
    enabled: bool,
    *,
    tenant_id: int | None = None,
    metadata: Mapping[str, Any] | None = None,
    db: AsyncSession,
) -> FeatureFlag:
    """Upsert de un flag. `tenant_id=None` opera sobre el flag global.

    Invalida la entrada de cache al cambiar. No hace commit — el
    llamante decide cuándo persistir.
    """
    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "name": name,
        "enabled": enabled,
    }
    if metadata is not None:
        payload["metadata"] = dict(metadata)

    # ON CONFLICT sobre la unique (tenant_id, name). Para el caso global
    # (tenant_id NULL) hay un índice parcial que también aplica.
    stmt = pg_insert(FeatureFlag).values(**payload)
    stmt = stmt.on_conflict_do_update(
        index_elements=["tenant_id", "name"],
        set_={
            "enabled": enabled,
            "metadata": payload.get("metadata", {}),
        },
    ).returning(FeatureFlag)

    result = await db.execute(stmt)
    row: FeatureFlag = result.scalar_one()
    _cache.pop((tenant_id, name), None)
    return row


async def delete_flag(
    name: str,
    *,
    tenant_id: int | None = None,
    db: AsyncSession,
) -> int:
    """Elimina el override (o el flag global). Devuelve filas afectadas."""
    stmt = delete(FeatureFlag).where(FeatureFlag.name == name)
    if tenant_id is None:
        stmt = stmt.where(FeatureFlag.tenant_id.is_(None))
    else:
        stmt = stmt.where(FeatureFlag.tenant_id == tenant_id)
    result = await db.execute(stmt)
    _cache.pop((tenant_id, name), None)
    return result.rowcount or 0


async def list_flags(
    *,
    tenant_id: int | None = None,
    db: AsyncSession,
) -> list[FeatureFlag]:
    """Lista overrides del tenant (o flags globales si tenant_id=None)."""
    stmt = select(FeatureFlag)
    if tenant_id is None:
        stmt = stmt.where(FeatureFlag.tenant_id.is_(None))
    else:
        stmt = stmt.where(FeatureFlag.tenant_id == tenant_id)
    stmt = stmt.order_by(FeatureFlag.name.asc())
    return list((await db.execute(stmt)).scalars().all())
