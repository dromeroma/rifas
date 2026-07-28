"""Excepciones del módulo customer."""
from __future__ import annotations


class CustomerModuleError(Exception):
    """Base para errores del módulo customer."""


class CustomerNotFoundError(CustomerModuleError):
    """No se encontró customer con los criterios dados."""


class IdentityConflictError(CustomerModuleError):
    """Una identity (tenant, kind, value) ya pertenece a otro customer.

    Se lanza al intentar agregarla al customer equivocado. El caller
    puede iniciar un flujo de merge (ver docs/02-DOMAIN.md sección
    "Identificación de customer").
    """

    def __init__(
        self,
        *,
        tenant_id: int,
        kind: str,
        value: str,
        existing_customer_id: int,
        attempted_customer_id: int | None = None,
    ):
        self.tenant_id = tenant_id
        self.kind = kind
        self.value = value
        self.existing_customer_id = existing_customer_id
        self.attempted_customer_id = attempted_customer_id
        super().__init__(
            f"identity ({kind}={value!r}) ya pertenece al customer "
            f"{existing_customer_id} — intento de asignar a "
            f"{attempted_customer_id!r}"
        )


class InvalidIdentityValueError(CustomerModuleError):
    """El valor de la identity no pasa la normalización mínima
    (ej. email inválido, phone sin dígitos, documento vacío)."""

    def __init__(self, kind: str, value: str, reason: str):
        self.kind = kind
        self.value = value
        self.reason = reason
        super().__init__(f"identity {kind}={value!r} inválida: {reason}")
