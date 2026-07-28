"""DTOs Pydantic del módulo customer — superficie de entrada/salida.

Los DTOs viven separados de los modelos ORM (uno cambia sin obligar al
otro). El router los usa para request/response; el service opera con
los ORM.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.customer.models import (
    ConsentAction,
    IdentityKind,
    NotificationChannel,
)


# ────────────────────────────────────────────────────────────────
# Identity
# ────────────────────────────────────────────────────────────────


class IdentityIn(BaseModel):
    """Payload para agregar/buscar una identity."""

    kind: IdentityKind
    value: str = Field(min_length=1, max_length=200)


class IdentityOut(BaseModel):
    id: int
    customer_id: int
    kind: IdentityKind
    value: str
    verified: bool
    verified_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ────────────────────────────────────────────────────────────────
# Preferences
# ────────────────────────────────────────────────────────────────


class PreferenceIn(BaseModel):
    channel: NotificationChannel
    allowed: bool = True
    settings: dict[str, Any] = Field(default_factory=dict)


class PreferenceOut(BaseModel):
    id: int
    channel: NotificationChannel
    allowed: bool
    settings: dict[str, Any]
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ────────────────────────────────────────────────────────────────
# Consent
# ────────────────────────────────────────────────────────────────


class ConsentIn(BaseModel):
    purpose: str = Field(min_length=1, max_length=80)
    action: ConsentAction = ConsentAction.GRANTED
    source: str = Field(min_length=1, max_length=60)
    evidence: dict[str, Any] = Field(default_factory=dict)
    policy_version: str | None = Field(default=None, max_length=40)
    notes: str | None = None


class ConsentOut(BaseModel):
    id: int
    customer_id: int
    purpose: str
    action: ConsentAction
    source: str
    policy_version: str | None = None
    granted_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ────────────────────────────────────────────────────────────────
# Identify (find-or-create)
# ────────────────────────────────────────────────────────────────


class IdentifyRequest(BaseModel):
    """Payload de `service.identify()` — reconoce o crea un customer.

    Se busca por `identity` (obligatoria). Si no existe, se crea el
    customer con los campos opcionales de `profile`. Los campos
    adicionales se guardan en `custom_attributes` del profile.
    """

    identity: IdentityIn
    full_name: str | None = Field(default=None, max_length=150)
    additional_identities: list[IdentityIn] = Field(default_factory=list)
    source: str | None = Field(default=None, max_length=60)


class IdentifyResult(BaseModel):
    customer_id: int
    first_time: bool          # True si el customer se creó en este llamado
    identities: list[IdentityOut] = Field(default_factory=list)
