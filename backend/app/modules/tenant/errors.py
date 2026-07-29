"""Errores tipados del módulo tenant."""
from __future__ import annotations


class TenantModuleError(Exception):
    """Base de errores del módulo tenant."""


class TenantProfileNotFoundError(TenantModuleError):
    def __init__(self, tenant_id: int) -> None:
        self.tenant_id = tenant_id
        super().__init__(f"perfil de tenant {tenant_id} no existe")


class InvalidActivationError(TenantModuleError):
    """Se intentó activar un tenant que no cumple prerequisitos.

    `missing` explica qué hace falta — usado por el UI para renderizar
    la lista concreta al usuario.
    """

    def __init__(self, tenant_id: int, missing: list[str]) -> None:
        self.tenant_id = tenant_id
        self.missing = list(missing)
        super().__init__(
            f"tenant {tenant_id} no puede activarse — faltan: {', '.join(missing)}"
        )
