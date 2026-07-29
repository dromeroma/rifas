"""audit: audit_logs (aditiva)

Sprint 10 de Fase 1. Módulo audit. Solo CREATE TABLE + índices —
cumple ADR-007.

Revision ID: o8c3d5f9g7b4
Revises: n7b2c4e8f6a3
Create Date: 2026-07-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o8c3d5f9g7b4"
down_revision: Union[str, None] = "n7b2c4e8f6a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "perks_audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("actor_kind", sa.String(length=20), nullable=False),
        sa.Column("actor_id", sa.String(length=80), nullable=True),
        sa.Column("actor_label", sa.String(length=120), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column(
            "severity",
            sa.String(length=20),
            nullable=False,
            server_default="info",
        ),
        sa.Column("resource_kind", sa.String(length=60), nullable=True),
        sa.Column("resource_id", sa.String(length=80), nullable=True),
        sa.Column(
            "changes",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("source_event_id", sa.String(length=40), nullable=True),
        sa.Column("trigger_event_id", sa.String(length=40), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenant_id", "source_event_id",
            name="uq_perks_audit_tenant_source_event",
        ),
    )
    op.create_index(
        "ix_perks_audit_logs_tenant_id",
        "perks_audit_logs", ["tenant_id"],
    )
    op.create_index(
        "ix_perks_audit_tenant_action",
        "perks_audit_logs", ["tenant_id", "action"],
    )
    op.create_index(
        "ix_perks_audit_tenant_actor",
        "perks_audit_logs", ["tenant_id", "actor_kind", "actor_id"],
    )
    op.create_index(
        "ix_perks_audit_tenant_resource",
        "perks_audit_logs", ["tenant_id", "resource_kind", "resource_id"],
    )
    op.create_index(
        "ix_perks_audit_tenant_occurred",
        "perks_audit_logs", ["tenant_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_perks_audit_tenant_occurred", table_name="perks_audit_logs")
    op.drop_index("ix_perks_audit_tenant_resource", table_name="perks_audit_logs")
    op.drop_index("ix_perks_audit_tenant_actor", table_name="perks_audit_logs")
    op.drop_index("ix_perks_audit_tenant_action", table_name="perks_audit_logs")
    op.drop_index("ix_perks_audit_logs_tenant_id", table_name="perks_audit_logs")
    op.drop_table("perks_audit_logs")
