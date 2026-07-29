"""Providers de notificación — uno por canal.

Cada provider implementa ProviderBase y se registra por canal en el
provider_registry. En Fase 1 activos:

  in_app  · guarda el mensaje en la tabla local (feed en la app).
  email   · fake por default (log a stdout). Puede intercambiarse por
            un adapter real (Resend/Postmark/SES/SMTP) editando el
            registry al arrancar.
  webhook · POST HTTP JSON al `destination`.

sms, whatsapp, push llegan cuando el tenant configure provider real —
la arquitectura ya lo soporta, solo falta el adapter.
"""
from app.modules.notifications.providers.base import (
    NotificationProvider,
    ProviderResult,
)
from app.modules.notifications.providers.registry import (
    ProviderRegistry,
    provider_registry,
)

# Import side effect: registra providers bundled.
from app.modules.notifications.providers import (  # noqa: F401
    in_app,
    email as email_provider,
    webhook,
)

__all__ = [
    "NotificationProvider",
    "ProviderRegistry",
    "ProviderResult",
    "provider_registry",
]
