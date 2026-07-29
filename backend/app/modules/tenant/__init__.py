"""Módulo tenant — perfil, vertical, branding y ciclo de vida del tenant.

Fase 1: tabla NUEVA aditiva `tenant_profile`, one-to-one con la
`tenants` legacy. NO reemplaza a `tenants` — la extiende con datos
que la Fase 1 necesita (branding, vertical, timezone, activated_at).

Post-cutover consideraremos absorber los campos operativos de
`tenants` acá; hoy solo agregamos.

API pública del módulo:
  - Modelos: TenantProfile, TenantStatus, TenantVertical
  - Servicio: get_or_create_profile, update_profile, activate,
    pause, get_profile
  - Errores: TenantProfileNotFoundError, InvalidActivationError
  - Eventos: tenant.profile.created, tenant.profile.updated,
    tenant.activated, tenant.paused
"""
from __future__ import annotations

from app.modules.tenant.errors import (
    InvalidActivationError,
    TenantProfileNotFoundError,
)
from app.modules.tenant.models import (
    TenantProfile,
    TenantStatus,
    TenantVertical,
)
from app.modules.tenant.schemas import (
    ProfileIn,
    ProfileOut,
    TenantVerticalEnum,
)
from app.modules.tenant.service import (
    activate as activate_tenant,
    get_or_create_profile,
    get_profile,
    pause as pause_tenant,
    update_profile,
)

__all__ = [
    "InvalidActivationError",
    "ProfileIn",
    "ProfileOut",
    "TenantProfile",
    "TenantProfileNotFoundError",
    "TenantStatus",
    "TenantVertical",
    "TenantVerticalEnum",
    "activate_tenant",
    "get_or_create_profile",
    "get_profile",
    "pause_tenant",
    "update_profile",
]
