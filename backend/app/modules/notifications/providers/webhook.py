"""Provider webhook — POST HTTP JSON al `destination`.

Uso típico: el tenant conecta un webhook de su Slack/Discord/CRM/n8n
para reaccionar a eventos de Perks. `destination` es la URL destino.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

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


# Allowlist opcional de dominios — evita SSRF interno.
# Por ahora sin restricción; en Fase 2 lo controla el tenant en config.
_ALLOWED_SCHEMES = {"http", "https"}
_TIMEOUT_SECONDS = 8.0


class WebhookProvider(NotificationProvider):
    channel = "webhook"

    async def send(
        self,
        delivery: "NotificationDelivery",
        db: "AsyncSession",
    ) -> ProviderResult:
        url = (delivery.destination or "").strip()
        if not url:
            return ProviderResult(
                success=False, error="destino webhook vacío",
                provider_meta={"provider": "webhook"},
            )

        parsed = httpx.URL(url)
        if parsed.scheme not in _ALLOWED_SCHEMES:
            return ProviderResult(
                success=False,
                error=f"scheme {parsed.scheme!r} no permitido",
                provider_meta={"provider": "webhook"},
            )

        payload = {
            "delivery_id": delivery.id,
            "tenant_id": delivery.tenant_id,
            "customer_id": delivery.customer_id,
            "template_key": delivery.template_key,
            "purpose": delivery.purpose,
            "subject": delivery.rendered_subject,
            "body": delivery.rendered_body,
            "html": delivery.rendered_html,
            "provider_meta": delivery.provider_meta,
        }

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=payload)
        except httpx.HTTPError as exc:
            logger.warning(
                "[webhook] delivery=%s tenant=%s url=%s error=%s",
                delivery.id, delivery.tenant_id, url, exc,
            )
            return ProviderResult(
                success=False, error=repr(exc),
                provider_meta={"provider": "webhook"},
            )

        success = 200 <= resp.status_code < 300
        return ProviderResult(
            success=success,
            error=None if success else f"HTTP {resp.status_code}",
            provider_meta={
                "provider": "webhook",
                "status_code": resp.status_code,
            },
        )


provider_registry.register(NotificationChannel.WEBHOOK, WebhookProvider())
