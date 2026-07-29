"""Excepciones del módulo notifications."""
from __future__ import annotations


class NotificationsModuleError(Exception):
    """Base."""


class TemplateNotFoundError(NotificationsModuleError):
    """No hay template (tenant, key, channel)."""

    def __init__(self, *, tenant_id: int, key: str, channel: str):
        self.tenant_id = tenant_id
        self.key = key
        self.channel = channel
        super().__init__(
            f"template {key!r}/{channel} no existe para tenant {tenant_id}"
        )


class DuplicateTemplateError(NotificationsModuleError):
    """Ya existe template con esa (tenant, key, channel)."""


class MissingDestinationError(NotificationsModuleError):
    """No se pudo derivar destino para el channel dado (ej. email
    para un customer sin ninguna identity email)."""


class ProviderNotConfiguredError(NotificationsModuleError):
    """El canal no tiene provider registrado — típicamente porque el
    tenant no ha activado ese canal todavía (Fase 1 in_app/email/webhook)."""


class ProviderSendError(NotificationsModuleError):
    """El provider levantó excepción durante send()."""

    def __init__(self, channel: str, cause: BaseException):
        self.channel = channel
        self.cause = cause
        super().__init__(f"provider {channel!r} falló: {cause!r}")


class InvalidTemplateError(NotificationsModuleError):
    """El template no puede renderizarse (placeholder mal formado, etc.)."""
