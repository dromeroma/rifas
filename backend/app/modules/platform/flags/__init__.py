"""platform.flags — feature flags DB-based con TTL y cache.

Ver docs/03-ARCHITECTURE.md AD-1/AD-4 y ADR-007 (zero-downtime):
todo cambio user-facing durante la ventana de freeze va detrás de un
flag configurable por tenant.

Exporta:

  - FeatureFlag: modelo ORM.
  - is_enabled(name, tenant_id=None, db=None): resuelve estado actual.
  - set_flag(name, enabled, tenant_id=None, expires_at=None, ...): CRUD.
  - GLOBAL_TENANT: sentinel para flags globales (no atados a tenant).
  - FlagRegistry: registro de flags conocidos con caducidad declarada.
"""
from app.modules.platform.flags.models import FeatureFlag
from app.modules.platform.flags.registry import (
    GLOBAL_TENANT,
    FLAG_DEFAULTS,
    FlagDefinition,
    FlagRegistry,
    known_flags,
)
from app.modules.platform.flags.service import (
    delete_flag,
    is_enabled,
    list_flags,
    set_flag,
)

__all__ = [
    "FLAG_DEFAULTS",
    "FeatureFlag",
    "FlagDefinition",
    "FlagRegistry",
    "GLOBAL_TENANT",
    "delete_flag",
    "is_enabled",
    "known_flags",
    "list_flags",
    "set_flag",
]
