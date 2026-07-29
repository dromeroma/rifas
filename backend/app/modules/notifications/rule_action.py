"""Registro de la action `notifications.send` en el Rules Engine.

Al importar este módulo, `@action_registry.register(...)` deja la
acción disponible para cualquier regla del tenant.

Params esperados en el DSL:
  template_key : str
  channel      : str (email | sms | whatsapp | push | in_app | webhook)
  destination  : str | null  (override; útil para webhooks)
  context      : dict        (extra vars para el render, además de
                              customer/event/wallet/now)
  idempotency_key : str | null

Los `expr:` / `path:` ya están resueltos por el Rules Engine antes
de invocar la action, así que aquí solo recibimos valores planos.
"""
from __future__ import annotations

import logging
from typing import Any, TYPE_CHECKING

from app.modules.notifications.errors import (
    MissingDestinationError,
    ProviderNotConfiguredError,
    ProviderSendError,
    TemplateNotFoundError,
)
from app.modules.notifications.models import NotificationChannel
from app.modules.notifications.schemas import SendRequest
from app.modules.notifications.service import send as notifications_send
from app.modules.platform.events import Actor, ActorKind
from app.modules.rules.actions.registry import action_registry
from app.modules.rules.errors import ActionExecutionError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.modules.platform.events import Event

logger = logging.getLogger(__name__)


def _coerce_channel(raw: Any) -> NotificationChannel:
    if isinstance(raw, NotificationChannel):
        return raw
    if isinstance(raw, str):
        try:
            return NotificationChannel(raw.strip().lower())
        except ValueError as exc:
            raise ActionExecutionError(
                "notifications.send",
                ValueError(f"channel desconocido: {raw!r}"),
            ) from exc
    raise ActionExecutionError(
        "notifications.send",
        ValueError(f"channel inválido: {raw!r}"),
    )


@action_registry.register("notifications.send")
async def notifications_send_action(
    *,
    db: "AsyncSession",
    tenant_id: int,
    event: "Event",
    params: dict[str, Any],
    customer_id: int | None,
    trigger_event_id: str | None = None,
) -> dict[str, Any]:
    """Ejecuta un envío a partir de una regla."""
    template_key = params.get("template_key")
    if not template_key:
        raise ActionExecutionError(
            "notifications.send",
            ValueError("template_key es requerido"),
        )
    channel_raw = params.get("channel")
    if not channel_raw:
        raise ActionExecutionError(
            "notifications.send",
            ValueError("channel es requerido"),
        )
    channel = _coerce_channel(channel_raw)

    request = SendRequest(
        template_key=str(template_key),
        channel=channel,
        customer_id=customer_id,
        destination=(params.get("destination") or None),
        context_extra=dict(params.get("context") or {}),
        idempotency_key=(params.get("idempotency_key") or None),
    )

    try:
        delivery = await notifications_send(
            db,
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.RULE),
            req=request,
            trigger_event_id=trigger_event_id,
            event_type_hint=event.type,
        )
    except (TemplateNotFoundError, MissingDestinationError,
            ProviderNotConfiguredError, ProviderSendError) as exc:
        raise ActionExecutionError("notifications.send", exc) from exc

    return {
        "action": "notifications.send",
        "delivery_id": delivery.id,
        "channel": delivery.channel.value,
        "template_key": delivery.template_key,
        "status": delivery.status.value,
        "destination": delivery.destination,
    }
