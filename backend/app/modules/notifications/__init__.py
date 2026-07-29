"""notifications — módulo de mensajería del ecosistema Perks.

Templates parametrizables + providers por canal + integración con el
Rules Engine (action `notifications.send`) + feed para el panel.

Superficie pública:

  Modelos:
    NotificationTemplate, NotificationDelivery
    NotificationChannel, DeliveryStatus

  DTOs:
    TemplateIn, TemplateOut, DeliveryOut, SendRequest

  Service:
    upsert_template, list_templates, delete_template, find_template
    send, list_deliveries

  Providers:
    provider_registry — activos por default: in_app, email (fake),
    webhook. sms/whatsapp/push disponibles cuando se registre adapter.

  Templating:
    build_context, render — Mustache-like sin ejecución de código.

  Errores:
    TemplateNotFoundError, DuplicateTemplateError, MissingDestinationError,
    ProviderNotConfiguredError, ProviderSendError, InvalidTemplateError

  Eventos publicados (constantes canónicas en `events`):
    notifications.message.queued / .sent / .delivered / .failed /
    .blocked / .opened / .clicked
    notifications.template.upserted / .deleted

Ver docs/06-REWARDS_ENGINE.md (menciones cross) y docs/04-EVENTS.md.
"""
from app.modules.notifications import events, providers  # noqa: F401
from app.modules.notifications import rule_action  # noqa: F401 — registra action

from app.modules.notifications.errors import (
    DuplicateTemplateError,
    InvalidTemplateError,
    MissingDestinationError,
    NotificationsModuleError,
    ProviderNotConfiguredError,
    ProviderSendError,
    TemplateNotFoundError,
)
from app.modules.notifications.models import (
    DeliveryStatus,
    NotificationChannel,
    NotificationDelivery,
    NotificationTemplate,
)
from app.modules.notifications.schemas import (
    DeliveryOut,
    SendRequest,
    TemplateIn,
    TemplateOut,
)
from app.modules.notifications.service import (
    delete_template,
    find_template,
    list_deliveries,
    list_templates,
    send,
    upsert_template,
)
from app.modules.notifications.templating import build_context, render

__all__ = [
    "DeliveryOut",
    "DeliveryStatus",
    "DuplicateTemplateError",
    "InvalidTemplateError",
    "MissingDestinationError",
    "NotificationChannel",
    "NotificationDelivery",
    "NotificationTemplate",
    "NotificationsModuleError",
    "ProviderNotConfiguredError",
    "ProviderSendError",
    "SendRequest",
    "TemplateIn",
    "TemplateNotFoundError",
    "TemplateOut",
    "build_context",
    "delete_template",
    "events",
    "find_template",
    "list_deliveries",
    "list_templates",
    "providers",
    "render",
    "send",
    "upsert_template",
]
