"""Módulo onboarding — checklist de arranque por tenant.

El onboarding es la primera experiencia real del owner en Perks. Sin
él, un tenant nuevo enfrenta un panel vacío y no sabe por dónde
empezar. Este módulo:

  1. Provee un checklist con pasos ordenados, con progreso y estado.
  2. Marca pasos como completados AUTOMÁTICAMENTE al escuchar eventos
     del bus (customer.identified, rules.rule.published,
     rules.rule.fired, notifications.message.sent, tenant.activated).
  3. Permite al usuario marcar/skip pasos manualmente cuando aplique.
  4. Bloquea `tenant.activate` hasta que los steps obligatorios estén
     completados o skipped explícitamente.

Contratos:
  - Los steps disponibles se definen en `steps.py` — es config
    estática, NO viven en BD (facilita cambios sin migraciones).
  - Cada tenant obtiene su fila `onboarding_step` on-demand la primera
    vez que se consulta el checklist (bootstrap idempotente).

Import side effects: registra handlers del bus. Los efectos son
efímeros al import — no toca BD.
"""
from __future__ import annotations

from app.modules.onboarding import handlers as _handlers  # noqa: F401 side effect
from app.modules.onboarding.errors import (
    OnboardingStepNotFoundError,
    OnboardingStepUnknownError,
)
from app.modules.onboarding.models import OnboardingStep, OnboardingStepStatus
from app.modules.onboarding.schemas import (
    ChecklistOut,
    StepOut,
)
from app.modules.onboarding.service import (
    complete_step,
    get_checklist,
    reopen_step,
    request_activation,
    skip_step,
)
from app.modules.onboarding.steps import DEFAULT_STEPS, StepDef

__all__ = [
    "ChecklistOut",
    "DEFAULT_STEPS",
    "OnboardingStep",
    "OnboardingStepNotFoundError",
    "OnboardingStepStatus",
    "OnboardingStepUnknownError",
    "StepDef",
    "StepOut",
    "complete_step",
    "get_checklist",
    "reopen_step",
    "request_activation",
    "skip_step",
]
