"""Pydantic schemas del módulo tenant."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.tenant.models import TenantStatus, TenantVertical


TenantVerticalEnum = TenantVertical


class ProfileIn(BaseModel):
    """Payload de update del perfil.

    Todos los campos son opcionales — el service aplica patch semántica
    (solo actualiza los pasados). `None` explícito NO borra un valor;
    para borrar, pasar string vacío en el campo relevante y el service
    lo interpreta como set-null cuando aplique.
    """

    brand_name: str | None = Field(default=None, max_length=120)
    brand_color_primary: str | None = Field(default=None, max_length=9)
    brand_color_secondary: str | None = Field(default=None, max_length=9)
    brand_logo_url: str | None = Field(default=None, max_length=500)

    vertical: TenantVertical | None = None

    timezone: str | None = Field(default=None, max_length=60)
    locale: str | None = Field(default=None, max_length=10)
    currency: str | None = Field(default=None, max_length=3)

    contact_email: str | None = Field(default=None, max_length=180)
    contact_phone: str | None = Field(default=None, max_length=40)
    support_url: str | None = Field(default=None, max_length=500)

    config: dict | None = None


class ProfileOut(BaseModel):
    """Perfil completo del tenant serializable a JSON."""

    model_config = ConfigDict(from_attributes=True)

    tenant_id: int

    brand_name: str | None
    brand_color_primary: str | None
    brand_color_secondary: str | None
    brand_logo_url: str | None

    vertical: TenantVertical | None

    timezone: str
    locale: str
    currency: str

    contact_email: str | None
    contact_phone: str | None
    support_url: str | None

    status: TenantStatus
    activated_at: datetime | None
    activated_by: str | None
    paused_at: datetime | None

    config: dict

    created_at: datetime
    updated_at: datetime
