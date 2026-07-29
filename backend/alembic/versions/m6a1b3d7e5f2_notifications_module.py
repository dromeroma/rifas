"""notifications: templates + deliveries (aditivas)

Sprint 7 de Fase 1. Cimientos del módulo notifications. Solo CREATE
TABLE + índices — cumple ADR-007.

Revision ID: m6a1b3d7e5f2
Revises: l5f9h6c4d3e0
Create Date: 2026-07-28 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m6a1b3d7e5f2"
down_revision: Union[str, None] = "l5f9h6c4d3e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── notification_templates ─────────────────────────
    op.create_table(
        "notification_templates",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject", sa.String(length=200), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column(
            "purpose",
            sa.String(length=40),
            nullable=False,
            server_default="transactional",
        ),
        sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.true(),
        ),
        sa.Column(
            "metadata",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "tenant_id", "key", "channel",
            name="uq_notification_template_tenant_key_channel",
        ),
    )
    op.create_index(
        "ix_notification_templates_tenant_id",
        "notification_templates", ["tenant_id"],
    )

    # ── notification_deliveries ────────────────────────
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "template_id",
            sa.BigInteger(),
            sa.ForeignKey("notification_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("template_key", sa.String(length=80), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("destination", sa.String(length=300), nullable=True),
        sa.Column("rendered_subject", sa.String(length=300), nullable=True),
        sa.Column("rendered_body", sa.Text(), nullable=False, server_default=""),
        sa.Column("rendered_html", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "provider_meta",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("idempotency_key", sa.String(length=120), nullable=True),
        sa.Column("related_event_id", sa.String(length=40), nullable=True),
        sa.Column(
            "queued_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "tenant_id", "idempotency_key",
            name="uq_notification_delivery_tenant_idempo",
        ),
    )
    op.create_index(
        "ix_notification_deliveries_tenant_id",
        "notification_deliveries", ["tenant_id"],
    )
    op.create_index(
        "ix_notification_deliveries_customer_id",
        "notification_deliveries", ["customer_id"],
    )
    op.create_index(
        "ix_notification_deliveries_template_id",
        "notification_deliveries", ["template_id"],
    )
    op.create_index(
        "ix_notification_deliveries_idempotency_key",
        "notification_deliveries", ["idempotency_key"],
    )
    op.create_index(
        "ix_notification_deliveries_related_event_id",
        "notification_deliveries", ["related_event_id"],
    )
    op.create_index(
        "ix_notification_delivery_customer_created",
        "notification_deliveries",
        ["customer_id", "queued_at"],
    )
    op.create_index(
        "ix_notification_delivery_status",
        "notification_deliveries",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_notification_delivery_status", table_name="notification_deliveries")
    op.drop_index("ix_notification_delivery_customer_created", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_related_event_id", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_idempotency_key", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_template_id", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_customer_id", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_tenant_id", table_name="notification_deliveries")
    op.drop_table("notification_deliveries")

    op.drop_index("ix_notification_templates_tenant_id", table_name="notification_templates")
    op.drop_table("notification_templates")
