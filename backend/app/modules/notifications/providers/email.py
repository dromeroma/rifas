"""Provider email — implementación fake por default.

En Fase 1 loguea el envío a stdout (útil para dev + tests) y devuelve
success. Un tenant real intercambia esta clase por un adapter real
(Resend, Postmark, SES, SMTP) sin tocar service.send() ni las reglas.

Cómo migrar a real:
  1. Crear adapter que implemente NotificationProvider.
  2. En este archivo, cambiar el `register(...)` al final para usar
     el nuevo adapter. Nada más.
"""
from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from app.modules.notifications.models import NotificationChannel
from app.modules.notifications.providers.base import (
    NotificationProvider,
    ProviderResult,
)
from app.modules.notifications.providers.registry import provider_registry

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.notifications.models import NotificationDelivery

logger = logging.getLogger(__name__)


class FakeEmailProvider(NotificationProvider):
    """Envío fake — deja rastro visible en logs para dev."""

    channel = "email"

    async def send(
        self,
        delivery: "NotificationDelivery",
        db: "AsyncSession",
    ) -> ProviderResult:
        if not delivery.destination:
            return ProviderResult(
                success=False,
                error="destino email vacío",
                provider_meta={"provider": "fake_email"},
            )

        logger.info(
            "[fake-email] tenant=%s to=%s subject=%r body_preview=%r",
            delivery.tenant_id,
            delivery.destination,
            delivery.rendered_subject,
            (delivery.rendered_body or "")[:120],
        )
        return ProviderResult(
            success=True,
            provider_meta={
                "provider": "fake_email",
                "message_id": f"fake-{delivery.id}",
            },
        )


# Selector explícito: si algún día seteamos NOTIFICATIONS_EMAIL_PROVIDER=real
# se puede switchear aquí sin tocar el resto.
_provider_kind = os.getenv("NOTIFICATIONS_EMAIL_PROVIDER", "fake").lower()

if _provider_kind == "fake":
    provider_registry.register(NotificationChannel.EMAIL, FakeEmailProvider())
else:
    # Placeholder para el futuro — cuando se agregue un adapter real,
    # importarlo aquí y registrarlo.
    logger.warning(
        "NOTIFICATIONS_EMAIL_PROVIDER=%r no soportado todavía — usando fake",
        _provider_kind,
    )
    provider_registry.register(NotificationChannel.EMAIL, FakeEmailProvider())
