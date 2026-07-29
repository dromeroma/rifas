"""Catálogo de eventos del módulo tenant.

Convención `tenant.<entity>.<action>` en pasado, ver docs/04-EVENTS.md.
"""
from __future__ import annotations


TENANT_PROFILE_CREATED = "tenant.profile.created"
TENANT_PROFILE_UPDATED = "tenant.profile.updated"

# Cambios de ciclo de vida — separados para que handlers puedan
# suscribirse sólo a la transición relevante sin filtrar por status.
TENANT_ACTIVATED = "tenant.activated"
TENANT_PAUSED = "tenant.paused"


ALL: tuple[str, ...] = (
    TENANT_PROFILE_CREATED,
    TENANT_PROFILE_UPDATED,
    TENANT_ACTIVATED,
    TENANT_PAUSED,
)
