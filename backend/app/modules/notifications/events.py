"""Catálogo de eventos publicados por el módulo notifications.

Convención `notifications.<entity>.<action>` en pasado. Ver
docs/04-EVENTS.md.
"""
from __future__ import annotations


NOTIFICATIONS_MESSAGE_QUEUED = "notifications.message.queued"
NOTIFICATIONS_MESSAGE_SENT = "notifications.message.sent"
NOTIFICATIONS_MESSAGE_DELIVERED = "notifications.message.delivered"
NOTIFICATIONS_MESSAGE_FAILED = "notifications.message.failed"
NOTIFICATIONS_MESSAGE_BLOCKED = "notifications.message.blocked"
NOTIFICATIONS_MESSAGE_OPENED = "notifications.message.opened"
NOTIFICATIONS_MESSAGE_CLICKED = "notifications.message.clicked"

NOTIFICATIONS_TEMPLATE_UPSERTED = "notifications.template.upserted"
NOTIFICATIONS_TEMPLATE_DELETED = "notifications.template.deleted"


ALL: tuple[str, ...] = (
    NOTIFICATIONS_MESSAGE_QUEUED,
    NOTIFICATIONS_MESSAGE_SENT,
    NOTIFICATIONS_MESSAGE_DELIVERED,
    NOTIFICATIONS_MESSAGE_FAILED,
    NOTIFICATIONS_MESSAGE_BLOCKED,
    NOTIFICATIONS_MESSAGE_OPENED,
    NOTIFICATIONS_MESSAGE_CLICKED,
    NOTIFICATIONS_TEMPLATE_UPSERTED,
    NOTIFICATIONS_TEMPLATE_DELETED,
)
