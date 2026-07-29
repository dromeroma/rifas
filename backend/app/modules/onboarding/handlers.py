"""Handlers del bus del módulo onboarding.

Cada handler auto-completa un step del checklist cuando ocurre el
evento relevante. Todos son idempotentes (complete_step ya lo es).

Los handlers reciben cualquier evento del bus (incluidos los del
propio módulo) — filtramos por tipo cuando corresponda. La suscripción
se registra por import side effect: al cargar
`app.modules.onboarding` desde `_handlers.py`, este archivo se
importa por el `__init__.py`.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.modules.customer import events as customer_events
from app.modules.notifications import events as notif_events
from app.modules.onboarding.service import complete_step
from app.modules.platform.events import Actor, ActorKind, Event, registry
from app.modules.rules import events as rules_events
from app.modules.tenant import events as tenant_events
from app.modules.tenant.models import TenantProfile

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


_SYSTEM_ACTOR = Actor(kind=ActorKind.SYSTEM)


async def _auto_complete(
    db: "AsyncSession", *, tenant_id: int, key: str, event: Event,
    meta: dict | None = None,
) -> None:
    """Wrapper que valida tenant y delega en el service.

    Silencia OnboardingStepUnknownError — si un evento suscrito ya no
    tiene step correspondiente (config cambió), no queremos que caiga
    el pipeline.
    """
    if tenant_id is None:
        return
    try:
        await complete_step(
            db,
            tenant_id=tenant_id,
            key=key,
            actor=_SYSTEM_ACTOR,
            trigger_event_id=event.id,
            meta=meta,
        )
    except Exception:
        logger.exception(
            "onboarding auto-complete falló key=%s tenant=%s event=%s",
            key, tenant_id, event.id,
        )
        raise


# ────────────────────────────────────────────────────────────────
# first_customer  ←  customer.identified
# ────────────────────────────────────────────────────────────────


@registry.on(
    customer_events.CUSTOMER_IDENTIFIED,
    handler_id="onboarding.first_customer_on_identified",
)
async def first_customer_on_identified(
    event: Event, db: "AsyncSession",
) -> None:
    await _auto_complete(
        db,
        tenant_id=event.tenant_id,
        key="first_customer",
        event=event,
        meta={"customer_id": event.subject.id},
    )


# ────────────────────────────────────────────────────────────────
# first_rule  ←  rules.rule.published
# ────────────────────────────────────────────────────────────────


@registry.on(
    rules_events.RULES_RULE_PUBLISHED,
    handler_id="onboarding.first_rule_on_published",
)
async def first_rule_on_published(
    event: Event, db: "AsyncSession",
) -> None:
    await _auto_complete(
        db,
        tenant_id=event.tenant_id,
        key="first_rule",
        event=event,
        meta={"rule_id": event.subject.id},
    )


# ────────────────────────────────────────────────────────────────
# first_rule_fired  ←  rules.rule.fired
# ────────────────────────────────────────────────────────────────


@registry.on(
    rules_events.RULES_RULE_FIRED,
    handler_id="onboarding.first_rule_fired_on_fired",
)
async def first_rule_fired_on_fired(
    event: Event, db: "AsyncSession",
) -> None:
    await _auto_complete(
        db,
        tenant_id=event.tenant_id,
        key="first_rule_fired",
        event=event,
        meta={"rule_id": event.subject.id},
    )


# ────────────────────────────────────────────────────────────────
# first_notification  ←  notifications.message.sent
# ────────────────────────────────────────────────────────────────


@registry.on(
    notif_events.NOTIFICATIONS_MESSAGE_SENT,
    handler_id="onboarding.first_notification_on_sent",
)
async def first_notification_on_sent(
    event: Event, db: "AsyncSession",
) -> None:
    await _auto_complete(
        db,
        tenant_id=event.tenant_id,
        key="first_notification",
        event=event,
        meta={"delivery_id": event.subject.id},
    )


# ────────────────────────────────────────────────────────────────
# brand_setup  ←  tenant.profile.updated
# Requiere que el perfil tenga nombre + color seteados; si el update
# no llegó al mínimo, deja el step pending.
# ────────────────────────────────────────────────────────────────


_BRAND_MIN_FIELDS = ("brand_name", "brand_color_primary")


@registry.on(
    tenant_events.TENANT_PROFILE_UPDATED,
    handler_id="onboarding.brand_setup_on_profile_updated",
)
async def brand_setup_on_profile_updated(
    event: Event, db: "AsyncSession",
) -> None:
    if event.tenant_id is None:
        return

    # Consultar snapshot actual — el evento data trae solo lo cambiado.
    result = await db.execute(
        select(TenantProfile).where(TenantProfile.tenant_id == event.tenant_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        return

    ok = all(getattr(profile, f) not in (None, "") for f in _BRAND_MIN_FIELDS)
    if not ok:
        return

    await _auto_complete(
        db,
        tenant_id=event.tenant_id,
        key="brand_setup",
        event=event,
        meta={
            "brand_name": profile.brand_name,
            "brand_color_primary": profile.brand_color_primary,
        },
    )


# ────────────────────────────────────────────────────────────────
# go_live  ←  tenant.activated
# ────────────────────────────────────────────────────────────────


@registry.on(
    tenant_events.TENANT_ACTIVATED,
    handler_id="onboarding.go_live_on_activated",
)
async def go_live_on_activated(
    event: Event, db: "AsyncSession",
) -> None:
    await _auto_complete(
        db,
        tenant_id=event.tenant_id,
        key="go_live",
        event=event,
    )


__all__ = [
    "brand_setup_on_profile_updated",
    "first_customer_on_identified",
    "first_notification_on_sent",
    "first_rule_fired_on_fired",
    "first_rule_on_published",
    "go_live_on_activated",
]
