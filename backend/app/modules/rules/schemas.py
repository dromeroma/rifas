"""DTOs Pydantic del Rules Engine.

El shape del DSL vive en `RuleDefinition` y sus sub-modelos —
Pydantic hace la primera capa de validación (estructura). La segunda
capa (`ActionType` conocido, expresiones sanas) la hace el service
llamando al parser del DSL.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.rules.models import ExecutionStatus


# ────────────────────────────────────────────────────────────────
# DSL — sub-modelos
# ────────────────────────────────────────────────────────────────


class Trigger(BaseModel):
    """Qué evento despierta la regla."""

    event: str = Field(min_length=1, max_length=120)

    @field_validator("event")
    @classmethod
    def _shape(cls, v: str) -> str:
        stripped = v.strip()
        parts = stripped.split(".") if stripped else []
        if len(parts) < 2 or len(parts) > 3:
            raise ValueError(
                f"trigger.event inválido: {v!r} — debe tener 2-3 niveles"
            )
        return stripped


class Predicate(BaseModel):
    """Predicado hoja: path op value."""

    path: str = Field(min_length=1)
    op: str = Field(min_length=1)
    value: Any | None = None


# Nota: recursivo — se resuelve con model_rebuild al final del módulo.
class ConditionGroup(BaseModel):
    """Cláusula compuesta: all / any / not."""

    all: list["Condition"] | None = None
    any: list["Condition"] | None = None
    not_: "Condition | None" = Field(default=None, alias="not")

    model_config = ConfigDict(populate_by_name=True)


Condition = ConditionGroup | Predicate


class Action(BaseModel):
    """Efecto a aplicar cuando la regla dispara."""

    type: str = Field(min_length=1, max_length=80)
    params: dict[str, Any] = Field(default_factory=dict)


class Limits(BaseModel):
    """Anti-abuso declarativo."""

    per_customer_per_day: int | None = Field(default=None, gt=0)
    per_customer_per_month: int | None = Field(default=None, gt=0)
    per_customer_lifetime: int | None = Field(default=None, gt=0)
    global_per_day: int | None = Field(default=None, gt=0)


class RuleDefinition(BaseModel):
    """DSL completo de una regla — así viaja en/desde la BD."""

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=60)
    enabled: bool = True
    trigger: Trigger
    conditions: Condition | None = None
    actions: list[Action] = Field(min_length=1)
    limits: Limits = Field(default_factory=Limits)
    cooldown_seconds: int = Field(default=0, ge=0)


ConditionGroup.model_rebuild()


# ────────────────────────────────────────────────────────────────
# CRUD requests / responses
# ────────────────────────────────────────────────────────────────


class RuleCreateRequest(BaseModel):
    """Payload para crear una regla nueva."""

    code: str = Field(min_length=1, max_length=80)
    definition: RuleDefinition


class RuleUpdateRequest(BaseModel):
    """Payload para editar el DSL de una regla existente.

    Crea RuleVersion nueva, ajusta active_version_id."""

    definition: RuleDefinition
    change_note: str | None = None


class RuleOut(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    description: str | None = None
    category: str | None = None
    enabled: bool
    trigger_event_type: str
    active_version_id: int | None = None
    active_version: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RuleExecutionOut(BaseModel):
    id: int
    rule_id: int
    rule_version_id: int
    event_id: str
    event_type: str
    customer_id: int | None = None
    status: ExecutionStatus
    actions_applied: list[dict]
    error: str | None = None
    latency_ms: int | None = None
    dry_run: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ────────────────────────────────────────────────────────────────
# Dry-run
# ────────────────────────────────────────────────────────────────


class DryRunRequest(BaseModel):
    """Ejecuta una regla contra un evento sintético SIN efectos.

    Útil para el botón "Probar" en el editor de reglas — el admin
    ve qué condiciones pasaron, qué acciones se ejecutarían, y qué
    payload final saldría.
    """

    event_type: str
    event_data: dict[str, Any] = Field(default_factory=dict)
    customer_id: int | None = None


class DryRunResult(BaseModel):
    status: ExecutionStatus
    matched_conditions: bool
    actions_planned: list[dict] = Field(default_factory=list)
    resolved_paths: dict[str, Any] = Field(default_factory=dict)
    limits_check: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    latency_ms: int | None = None
