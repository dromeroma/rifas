"""Pydantic schemas del módulo onboarding."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.onboarding.models import OnboardingStepStatus


class StepOut(BaseModel):
    """Un step del checklist tal como lo consume el UI.

    Combina la definición estática (title, description, required, cta)
    con el estado persistido del tenant (status, timestamps, meta).
    """

    model_config = ConfigDict(from_attributes=True)

    key: str
    title: str
    description: str
    required: bool
    weight: int
    cta: str | None

    status: OnboardingStepStatus
    completed_at: datetime | None
    completed_by: str | None
    trigger_event_id: str | None
    meta: dict


class ChecklistOut(BaseModel):
    """Checklist completo + agregados que el UI usa como KPIs de arriba."""

    tenant_id: int
    steps: list[StepOut]

    total: int
    completed: int
    skipped: int
    pending: int
    progress: float                # 0..1, ponderado por weight
    required_missing: list[str]    # keys de required aún pending
    activation_ready: bool         # required_missing == []
    activated: bool                # snapshot: TenantProfile.status ACTIVE?


class SkipIn(BaseModel):
    reason: str | None = None


class ManualCompleteIn(BaseModel):
    meta: dict | None = None
    reason: str | None = None
