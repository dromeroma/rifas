"""Interfaz común de providers de notificación."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.notifications.models import NotificationDelivery


@dataclass
class ProviderResult:
    """Resultado normalizado del intento de envío.

    `success=True` no significa "el destinatario ya lo vio" — significa
    "el provider aceptó el mensaje". El delivered/opened lo pintan
    webhooks del provider en Fase 2.
    """

    success: bool
    provider_meta: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class NotificationProvider(Protocol):
    """Contract que cada provider por canal debe implementar."""

    channel: str

    async def send(
        self,
        delivery: "NotificationDelivery",
        db: "AsyncSession",
    ) -> ProviderResult:
        """Ejecuta el envío. NO debe hacer commit — el service lo hace
        después de actualizar la fila del delivery con el resultado."""
        ...
