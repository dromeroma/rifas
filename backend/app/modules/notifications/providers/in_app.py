"""Provider in_app — el mensaje vive solo en la BD local.

El "envío" es un no-op: la fila del delivery ya se creó en el
service.send(); este provider solo confirma. La UI del panel (o app
del customer en el futuro) consulta las deliveries por customer_id
para mostrar el feed.
"""
from __future__ import annotations

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


class InAppProvider(NotificationProvider):
    channel = "in_app"

    async def send(
        self,
        delivery: "NotificationDelivery",
        db: "AsyncSession",
    ) -> ProviderResult:
        # No hay red que llamar — el mensaje ya vive en la BD.
        # Marcamos SENT + DELIVERED de una vez.
        return ProviderResult(
            success=True,
            provider_meta={"provider": "in_app"},
        )


provider_registry.register(NotificationChannel.IN_APP, InAppProvider())
