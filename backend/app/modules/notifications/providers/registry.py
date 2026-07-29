"""Registro por canal de providers activos."""
from __future__ import annotations

import logging

from app.modules.notifications.errors import ProviderNotConfiguredError
from app.modules.notifications.models import NotificationChannel
from app.modules.notifications.providers.base import NotificationProvider

logger = logging.getLogger(__name__)


class ProviderRegistry:
    """Lookup por canal — un provider vivo por canal.

    El bind se hace al import time por convención (cada archivo del
    submódulo providers/ se auto-registra). El tenant NO elige
    provider — es una decisión de plataforma.
    """

    def __init__(self) -> None:
        self._map: dict[NotificationChannel, NotificationProvider] = {}

    def register(
        self,
        channel: NotificationChannel,
        provider: NotificationProvider,
    ) -> None:
        if channel in self._map:
            logger.warning(
                "provider %r ya estaba registrado para canal %s — sobrescribiendo",
                self._map[channel], channel.value,
            )
        self._map[channel] = provider

    def get(self, channel: NotificationChannel) -> NotificationProvider:
        provider = self._map.get(channel)
        if provider is None:
            raise ProviderNotConfiguredError(
                f"canal {channel.value!r} no tiene provider registrado — "
                "activa un adapter o desactiva el envío por este canal"
            )
        return provider

    def is_configured(self, channel: NotificationChannel) -> bool:
        return channel in self._map

    def all(self) -> list[str]:
        return sorted(c.value for c in self._map.keys())


provider_registry = ProviderRegistry()
