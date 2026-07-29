"""Catálogo de eventos del módulo onboarding."""
from __future__ import annotations


ONBOARDING_STEP_COMPLETED = "onboarding.step.completed"
ONBOARDING_STEP_SKIPPED = "onboarding.step.skipped"
ONBOARDING_STEP_REOPENED = "onboarding.step.reopened"

# Se emite exactamente una vez cuando TODOS los steps requeridos
# están completados/skipped. Handler típico: enviar un email de
# bienvenida + activar el flag operativo del tenant.
ONBOARDING_TENANT_COMPLETED = "onboarding.tenant.completed"


ALL: tuple[str, ...] = (
    ONBOARDING_STEP_COMPLETED,
    ONBOARDING_STEP_SKIPPED,
    ONBOARDING_STEP_REOPENED,
    ONBOARDING_TENANT_COMPLETED,
)
