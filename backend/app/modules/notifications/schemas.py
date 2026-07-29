"""DTOs Pydantic del módulo notifications."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.notifications.models import (
    DeliveryStatus,
    NotificationChannel,
)


class TemplateIn(BaseModel):
    """Payload para crear/actualizar un template."""

    key: str = Field(min_length=1, max_length=80)
    channel: NotificationChannel
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    subject: str | None = Field(default=None, max_length=200)
    body_text: str = ""
    body_html: str | None = None
    purpose: str = Field(default="transactional", max_length=40)
    enabled: bool = True


class TemplateOut(BaseModel):
    id: int
    tenant_id: int
    key: str
    channel: NotificationChannel
    name: str
    description: str | None = None
    subject: str | None = None
    body_text: str
    body_html: str | None = None
    purpose: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeliveryOut(BaseModel):
    id: int
    tenant_id: int
    customer_id: int | None = None
    template_id: int | None = None
    template_key: str
    channel: NotificationChannel
    purpose: str
    destination: str | None = None
    rendered_subject: str | None = None
    rendered_body: str
    rendered_html: str | None = None
    status: DeliveryStatus
    error: str | None = None
    provider_meta: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None
    related_event_id: str | None = None
    queued_at: datetime
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    opened_at: datetime | None = None
    clicked_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SendRequest(BaseModel):
    """Payload de envío directo (usado por el router y por la action)."""

    template_key: str = Field(min_length=1, max_length=80)
    channel: NotificationChannel
    customer_id: int | None = None
    # Override manual del destino — útil para transactional a un email
    # concreto que no está en las identities del customer.
    destination: str | None = Field(default=None, max_length=300)
    # Data extra para el renderizado (además de customer/event/wallet).
    context_extra: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, max_length=120)
