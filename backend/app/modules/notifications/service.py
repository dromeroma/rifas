"""Service del módulo notifications.

Superficie:

  send(db, tenant_id, actor, req) -> NotificationDelivery
      Motor de envío. Valida template, resuelve destino, enforce
      preference/consent, renderiza, crea delivery, llama provider,
      actualiza status, publica eventos.

  upsert_template(...) / list_templates / delete_template
      CRUD de templates por tenant.

  list_deliveries(tenant, customer=None, limit=..)
      Feed cronológico — usado por la UI del panel.

Regla de consent (Habeas Data / GDPR):
  - Templates con purpose='transactional' se envían siempre (avisos
    operativos: pago, seguridad, verificación).
  - El resto (marketing/analytics/personalization) requieren:
      - CustomerPreference(channel).allowed = True (default True si
        no existe fila), Y
      - CustomerConsent(purpose) más reciente con action='granted'
        (default: no requerido si no hay consent registrado — el
        tenant es responsable de configurarlo). En Fase 1 usamos
        solo el opt-out por canal (preference).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.customer import Customer as _LegacyCustomer
from app.modules.customer.models import (
    CustomerIdentity,
    CustomerPreference,
    IdentityKind,
    NotificationChannel as CustomerNotifChannel,
)
from app.modules.notifications.errors import (
    DuplicateTemplateError,
    MissingDestinationError,
    ProviderNotConfiguredError,
    ProviderSendError,
    TemplateNotFoundError,
)
from app.modules.notifications.events import (
    NOTIFICATIONS_MESSAGE_BLOCKED,
    NOTIFICATIONS_MESSAGE_FAILED,
    NOTIFICATIONS_MESSAGE_QUEUED,
    NOTIFICATIONS_MESSAGE_SENT,
    NOTIFICATIONS_TEMPLATE_DELETED,
    NOTIFICATIONS_TEMPLATE_UPSERTED,
)
from app.modules.notifications.models import (
    DeliveryStatus,
    NotificationChannel,
    NotificationDelivery,
    NotificationTemplate,
)
from app.modules.notifications.providers.registry import provider_registry
from app.modules.notifications.schemas import SendRequest, TemplateIn
from app.modules.notifications.templating import build_context, render
from app.modules.platform.events import (
    Actor,
    Event,
    EventContext,
    Subject,
    publish,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────
# Templates CRUD
# ────────────────────────────────────────────────────────────────


async def find_template(
    db: "AsyncSession",
    *,
    tenant_id: int,
    key: str,
    channel: NotificationChannel,
) -> NotificationTemplate | None:
    stmt = select(NotificationTemplate).where(
        NotificationTemplate.tenant_id == tenant_id,
        NotificationTemplate.key == key,
        NotificationTemplate.channel == channel,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def upsert_template(
    db: "AsyncSession",
    *,
    tenant_id: int,
    payload: TemplateIn,
    actor: Actor,
) -> NotificationTemplate:
    """Crea o actualiza template por (tenant, key, channel)."""
    values = {
        "tenant_id": tenant_id,
        "key": payload.key,
        "channel": payload.channel,
        "name": payload.name,
        "description": payload.description,
        "subject": payload.subject,
        "body_text": payload.body_text,
        "body_html": payload.body_html,
        "purpose": payload.purpose,
        "enabled": payload.enabled,
    }
    stmt = pg_insert(NotificationTemplate).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["tenant_id", "key", "channel"],
        set_={
            "name": payload.name,
            "description": payload.description,
            "subject": payload.subject,
            "body_text": payload.body_text,
            "body_html": payload.body_html,
            "purpose": payload.purpose,
            "enabled": payload.enabled,
        },
    ).returning(NotificationTemplate)
    row: NotificationTemplate = (await db.execute(stmt)).scalar_one()

    await publish(
        Event(
            type=NOTIFICATIONS_TEMPLATE_UPSERTED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="notification_template", id=row.id),
            data={"key": row.key, "channel": row.channel.value},
        ),
        db,
    )
    return row


async def list_templates(
    db: "AsyncSession",
    *,
    tenant_id: int,
    channel: NotificationChannel | None = None,
) -> list[NotificationTemplate]:
    stmt = select(NotificationTemplate).where(
        NotificationTemplate.tenant_id == tenant_id,
    )
    if channel is not None:
        stmt = stmt.where(NotificationTemplate.channel == channel)
    stmt = stmt.order_by(NotificationTemplate.key.asc(), NotificationTemplate.channel.asc())
    return list((await db.execute(stmt)).scalars().all())


async def delete_template(
    db: "AsyncSession",
    *,
    tenant_id: int,
    template_id: int,
    actor: Actor,
) -> bool:
    row = await db.get(NotificationTemplate, template_id)
    if row is None or row.tenant_id != tenant_id:
        return False
    key = row.key
    channel = row.channel.value
    await db.delete(row)
    await db.flush()
    await publish(
        Event(
            type=NOTIFICATIONS_TEMPLATE_DELETED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="notification_template", id=template_id),
            data={"key": key, "channel": channel},
        ),
        db,
    )
    return True


# ────────────────────────────────────────────────────────────────
# Destination resolution
# ────────────────────────────────────────────────────────────────


_CHANNEL_TO_IDENTITY_KIND: dict[NotificationChannel, IdentityKind] = {
    NotificationChannel.EMAIL: IdentityKind.EMAIL,
    NotificationChannel.SMS: IdentityKind.PHONE,
    NotificationChannel.WHATSAPP: IdentityKind.PHONE,
}


async def _resolve_destination(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int | None,
    channel: NotificationChannel,
    override: str | None,
) -> str | None:
    """Determina el destino final del envío.

    Prioridad:
      1. `override` explícito (viene del caller).
      2. CustomerIdentity del kind correspondiente al canal
         (email/phone), verified first, then any.
      3. Fallback a legacy customers.email / .phone si no hay identity.
      4. in_app → destination = "customer:{id}" (no hay red).
      5. webhook → destination viene solo por override.
    """
    if override:
        return override.strip() or None

    if channel is NotificationChannel.IN_APP:
        return f"customer:{customer_id}" if customer_id else None

    if channel is NotificationChannel.WEBHOOK:
        return None  # webhook siempre requiere override

    if customer_id is None:
        return None

    kind = _CHANNEL_TO_IDENTITY_KIND.get(channel)
    if kind is None:
        # push, otros — sin resolución automática todavía
        return None

    # Preferimos identity verified.
    stmt = (
        select(CustomerIdentity)
        .where(
            CustomerIdentity.tenant_id == tenant_id,
            CustomerIdentity.customer_id == customer_id,
            CustomerIdentity.kind == kind,
        )
        .order_by(CustomerIdentity.verified.desc(), CustomerIdentity.id.desc())
        .limit(1)
    )
    identity = (await db.execute(stmt)).scalar_one_or_none()
    if identity is not None:
        return identity.value

    # Fallback: tabla customers legacy (para customers pre-existentes
    # que no tienen identity registrada todavía).
    legacy = await db.get(_LegacyCustomer, customer_id)
    if legacy is None:
        return None
    if channel is NotificationChannel.EMAIL:
        return legacy.email
    if channel in (NotificationChannel.SMS, NotificationChannel.WHATSAPP):
        return legacy.phone
    return None


# ────────────────────────────────────────────────────────────────
# Preference enforcement
# ────────────────────────────────────────────────────────────────


_CHANNEL_TO_CUSTOMER_CHANNEL: dict[NotificationChannel, CustomerNotifChannel] = {
    NotificationChannel.EMAIL: CustomerNotifChannel.EMAIL,
    NotificationChannel.SMS: CustomerNotifChannel.SMS,
    NotificationChannel.WHATSAPP: CustomerNotifChannel.WHATSAPP,
    NotificationChannel.PUSH: CustomerNotifChannel.PUSH,
}


async def _preference_allows(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int | None,
    channel: NotificationChannel,
    purpose: str,
) -> bool:
    """Regla de consent en Fase 1:
    - transactional: siempre permitido.
    - resto: si existe CustomerPreference(allowed=False) → bloqueado.
             Sin fila → permitido por default (opt-out model).
    """
    if purpose == "transactional":
        return True
    if customer_id is None:
        return True   # sin customer no hay a quién opt-outar
    cust_channel = _CHANNEL_TO_CUSTOMER_CHANNEL.get(channel)
    if cust_channel is None:
        return True   # in_app/webhook no tienen preferencia
    stmt = select(CustomerPreference).where(
        CustomerPreference.tenant_id == tenant_id,
        CustomerPreference.customer_id == customer_id,
        CustomerPreference.channel == cust_channel,
    )
    pref = (await db.execute(stmt)).scalar_one_or_none()
    if pref is None:
        return True
    return bool(pref.allowed)


# ────────────────────────────────────────────────────────────────
# send() — motor principal
# ────────────────────────────────────────────────────────────────


async def _load_customer_snapshot(
    db: "AsyncSession", customer_id: int | None,
) -> dict[str, Any]:
    if customer_id is None:
        return {}
    row = await db.get(_LegacyCustomer, customer_id)
    if row is None:
        return {}
    return {
        "id": row.id,
        "full_name": row.full_name,
        "email": row.email,
        "phone": row.phone,
        "document": row.document,
    }


async def send(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
    req: SendRequest,
    event_context: EventContext | None = None,
    trigger_event_id: str | None = None,
    event_type_hint: str | None = None,
) -> NotificationDelivery:
    """Ejecuta un envío end-to-end.

    Devuelve la fila del delivery — el llamante hace commit.
    """
    # 1. Idempotencia — si viene idempotency_key y ya existe, devolvemos
    #    la fila previa sin re-enviar.
    if req.idempotency_key:
        existing = (
            await db.execute(
                select(NotificationDelivery).where(
                    NotificationDelivery.tenant_id == tenant_id,
                    NotificationDelivery.idempotency_key == req.idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing

    # 2. Cargar template
    template = await find_template(
        db, tenant_id=tenant_id, key=req.template_key, channel=req.channel,
    )
    if template is None:
        raise TemplateNotFoundError(
            tenant_id=tenant_id, key=req.template_key, channel=req.channel.value,
        )
    if not template.enabled:
        raise TemplateNotFoundError(
            tenant_id=tenant_id, key=req.template_key,
            channel=f"{req.channel.value} (disabled)",
        )

    # 3. Resolver destino
    destination = await _resolve_destination(
        db,
        tenant_id=tenant_id,
        customer_id=req.customer_id,
        channel=req.channel,
        override=req.destination,
    )

    # 4. Renderizar
    customer_snap = await _load_customer_snapshot(db, req.customer_id)
    context = build_context(
        customer=customer_snap,
        event_data=req.context_extra,
        event_type=event_type_hint,
    )
    rendered_subject = render(template.subject, context) if template.subject else None
    rendered_body = render(template.body_text, context)
    rendered_html = render(template.body_html, context) if template.body_html else None

    # 5. Crear la fila del delivery (siempre — para audit incluso
    #    cuando termine BLOCKED/FAILED)
    delivery = NotificationDelivery(
        tenant_id=tenant_id,
        customer_id=req.customer_id,
        template_id=template.id,
        template_key=template.key,
        channel=template.channel,
        purpose=template.purpose,
        destination=destination,
        rendered_subject=rendered_subject,
        rendered_body=rendered_body,
        rendered_html=rendered_html,
        status=DeliveryStatus.QUEUED,
        idempotency_key=req.idempotency_key,
        related_event_id=trigger_event_id,
    )
    db.add(delivery)
    await db.flush()

    await publish(
        Event(
            type=NOTIFICATIONS_MESSAGE_QUEUED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="notification_delivery", id=delivery.id),
            context=event_context or EventContext(trigger_event_id=trigger_event_id),
            data={
                "customer_id": req.customer_id,
                "channel": template.channel.value,
                "template_key": template.key,
                "purpose": template.purpose,
            },
        ),
        db,
    )

    # 6. Chequear preference/consent
    allowed = await _preference_allows(
        db,
        tenant_id=tenant_id,
        customer_id=req.customer_id,
        channel=template.channel,
        purpose=template.purpose,
    )
    if not allowed:
        delivery.status = DeliveryStatus.BLOCKED
        delivery.error = "customer preference blocks this channel/purpose"
        await publish(
            Event(
                type=NOTIFICATIONS_MESSAGE_BLOCKED,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="notification_delivery", id=delivery.id),
                context=event_context or EventContext(trigger_event_id=trigger_event_id),
                data={
                    "customer_id": req.customer_id,
                    "channel": template.channel.value,
                    "reason": "preference_opt_out",
                },
            ),
            db,
        )
        return delivery

    # 7. Chequear destino
    if not destination and template.channel is not NotificationChannel.IN_APP:
        delivery.status = DeliveryStatus.FAILED
        delivery.error = "destination could not be resolved"
        await publish(
            Event(
                type=NOTIFICATIONS_MESSAGE_FAILED,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="notification_delivery", id=delivery.id),
                context=event_context or EventContext(trigger_event_id=trigger_event_id),
                data={"reason": "missing_destination"},
            ),
            db,
        )
        raise MissingDestinationError(
            f"no se pudo derivar destination para channel={template.channel.value} "
            f"customer={req.customer_id}"
        )

    # 8. Provider
    try:
        provider = provider_registry.get(template.channel)
    except ProviderNotConfiguredError as exc:
        delivery.status = DeliveryStatus.FAILED
        delivery.error = str(exc)
        await publish(
            Event(
                type=NOTIFICATIONS_MESSAGE_FAILED,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="notification_delivery", id=delivery.id),
                context=event_context or EventContext(trigger_event_id=trigger_event_id),
                data={"reason": "provider_not_configured"},
            ),
            db,
        )
        raise

    try:
        result = await provider.send(delivery, db)
    except Exception as exc:  # noqa: BLE001 — provider abstracto
        delivery.status = DeliveryStatus.FAILED
        delivery.error = repr(exc)
        await publish(
            Event(
                type=NOTIFICATIONS_MESSAGE_FAILED,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="notification_delivery", id=delivery.id),
                context=event_context or EventContext(trigger_event_id=trigger_event_id),
                data={"reason": "provider_exception", "detail": repr(exc)[:200]},
            ),
            db,
        )
        raise ProviderSendError(template.channel.value, exc) from exc

    now = datetime.now(timezone.utc)
    delivery.provider_meta = {**(delivery.provider_meta or {}), **result.provider_meta}

    if result.success:
        delivery.status = DeliveryStatus.SENT
        delivery.sent_at = now
        # in_app se considera delivered inmediatamente — el usuario lo
        # lee cuando abra la app y su read status irá aparte.
        if template.channel is NotificationChannel.IN_APP:
            delivery.status = DeliveryStatus.DELIVERED
            delivery.delivered_at = now
        await publish(
            Event(
                type=NOTIFICATIONS_MESSAGE_SENT,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="notification_delivery", id=delivery.id),
                context=event_context or EventContext(trigger_event_id=trigger_event_id),
                data={
                    "customer_id": req.customer_id,
                    "channel": template.channel.value,
                    "template_key": template.key,
                    "destination": destination,
                },
            ),
            db,
        )
    else:
        delivery.status = DeliveryStatus.FAILED
        delivery.error = result.error
        await publish(
            Event(
                type=NOTIFICATIONS_MESSAGE_FAILED,
                tenant_id=tenant_id,
                actor=actor,
                subject=Subject(kind="notification_delivery", id=delivery.id),
                context=event_context or EventContext(trigger_event_id=trigger_event_id),
                data={"reason": "provider_failed", "detail": result.error},
            ),
            db,
        )

    return delivery


# ────────────────────────────────────────────────────────────────
# Feed
# ────────────────────────────────────────────────────────────────


async def list_deliveries(
    db: "AsyncSession",
    *,
    tenant_id: int,
    customer_id: int | None = None,
    channel: NotificationChannel | None = None,
    limit: int = 50,
) -> list[NotificationDelivery]:
    stmt = select(NotificationDelivery).where(
        NotificationDelivery.tenant_id == tenant_id,
    )
    if customer_id is not None:
        stmt = stmt.where(NotificationDelivery.customer_id == customer_id)
    if channel is not None:
        stmt = stmt.where(NotificationDelivery.channel == channel)
    stmt = stmt.order_by(NotificationDelivery.id.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())
