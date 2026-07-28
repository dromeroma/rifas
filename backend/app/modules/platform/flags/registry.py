"""Registro central de feature flags conocidos.

Cada flag que exista en el sistema se declara aquí con:
  - descripción legible.
  - default (usado cuando no hay fila en BD).
  - fecha de retiro esperada (deuda visible).
  - dueño / ADR relacionado.

Ventajas de declararlos aquí:
  1. Un dev nuevo lee este archivo y sabe qué flags existen.
  2. Fallback determinístico si la BD no tiene fila (útil en tests,
     en cold start, y para evitar sorpresas).
  3. Reporte automático de flags vencidos (hay que retirar).

Convención de naming: `<module>.<feature>`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


# Sentinel para flags globales (no atados a tenant).
GLOBAL_TENANT: int | None = None


@dataclass(frozen=True)
class FlagDefinition:
    """Metadata de un flag conocido."""

    name: str
    description: str
    default: bool = False
    expires_on: date | None = None    # fecha objetivo de retiro
    owner: str = "platform"
    related_adr: str | None = None


class FlagRegistry:
    """Contenedor de FlagDefinitions."""

    def __init__(self) -> None:
        self._defs: dict[str, FlagDefinition] = {}

    def register(self, definition: FlagDefinition) -> FlagDefinition:
        if definition.name in self._defs:
            raise ValueError(f"flag {definition.name!r} ya está registrado")
        self._defs[definition.name] = definition
        return definition

    def get(self, name: str) -> FlagDefinition | None:
        return self._defs.get(name)

    def default_for(self, name: str) -> bool:
        d = self._defs.get(name)
        return d.default if d else False

    def all(self) -> list[FlagDefinition]:
        return sorted(self._defs.values(), key=lambda d: d.name)


known_flags = FlagRegistry()


# ────────────────────────────────────────────────────────────────
# Catálogo inicial de flags de plataforma.
# Cualquier módulo puede registrar los suyos en su propio events.py
# o config.py — la única regla es hacerlo al import time.
# ────────────────────────────────────────────────────────────────

known_flags.register(
    FlagDefinition(
        name="platform.event_dispatcher",
        description=(
            "Activa el consumo del event bus en el proceso FastAPI. "
            "Off por default hasta el cutover post-freeze (ADR-006/007)."
        ),
        default=False,
        expires_on=date(2026, 12, 31),
        owner="platform",
        related_adr="ADR-002",
    )
)

known_flags.register(
    FlagDefinition(
        name="perks.admin_api",
        description=(
            "Expone las rutas /api/v1/customers/* y /api/v1/rules/* del "
            "admin panel de Savvy Perks. Off por default hasta que el "
            "panel frontend esté listo y estable. Con flag off los "
            "endpoints devuelven 404 (no aparecen en OpenAPI ni en "
            "runtime) — cero riesgo para el flujo legacy de rifas."
        ),
        default=False,
        expires_on=date(2026, 12, 31),
        owner="perks",
        related_adr="ADR-007",
    )
)


# Diccionario derivado para lookups rápidos.
FLAG_DEFAULTS: dict[str, bool] = {
    d.name: d.default for d in known_flags.all()
}
