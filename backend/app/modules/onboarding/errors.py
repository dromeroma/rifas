"""Errores tipados del módulo onboarding."""
from __future__ import annotations


class OnboardingError(Exception):
    """Base."""


class OnboardingStepUnknownError(OnboardingError):
    """La `step_key` pedida no está en la config estática de steps."""

    def __init__(self, key: str) -> None:
        self.key = key
        super().__init__(f"step {key!r} no está definido en DEFAULT_STEPS")


class OnboardingStepNotFoundError(OnboardingError):
    """La fila del step no existe para este tenant (bootstrap pendiente)."""

    def __init__(self, tenant_id: int, key: str) -> None:
        self.tenant_id = tenant_id
        self.key = key
        super().__init__(
            f"step {key!r} del tenant {tenant_id} no existe todavía"
        )
