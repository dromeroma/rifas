"""rules: rules + rule_versions + rule_executions (aditivas)

Sprint 5 de Fase 1. Cimientos del Rules Engine V1 (DSL JSON). Solo
CREATE TABLE + CREATE INDEX + UNIQUE constraints — cumple ADR-007.

Revision ID: l5f9h6c4d3e0
Revises: k4e8g5b3c2d9
Create Date: 2026-07-28 22:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l5f9h6c4d3e0"
down_revision: Union[str, None] = "k4e8g5b3c2d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── rules ──────────────────────────────────────────────────
    op.create_table(
        "rules",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=60), nullable=True),
        sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.true(),
        ),
        sa.Column("trigger_event_type", sa.String(length=120), nullable=False),
        sa.Column("active_version_id", sa.BigInteger(), nullable=True),
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
        sa.UniqueConstraint("tenant_id", "code", name="uq_rule_tenant_code"),
    )
    op.create_index("ix_rules_tenant_id", "rules", ["tenant_id"])
    op.create_index(
        "ix_rule_tenant_trigger_enabled",
        "rules",
        ["tenant_id", "trigger_event_type", "enabled"],
    )

    # ── rule_versions ──────────────────────────────────────────
    op.create_table(
        "rule_versions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "rule_id",
            sa.BigInteger(),
            sa.ForeignKey("rules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "dsl", sa.dialects.postgresql.JSONB(), nullable=False,
        ),
        sa.Column("created_by_member_id", sa.Integer(), nullable=True),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "rule_id", "version", name="uq_rule_version_rule_version",
        ),
    )
    op.create_index("ix_rule_versions_tenant_id", "rule_versions", ["tenant_id"])
    op.create_index("ix_rule_versions_rule_id", "rule_versions", ["rule_id"])

    # ── rule_executions ────────────────────────────────────────
    op.create_table(
        "rule_executions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "rule_id",
            sa.BigInteger(),
            sa.ForeignKey("rules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "rule_version_id",
            sa.BigInteger(),
            sa.ForeignKey("rule_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_id", sa.String(length=40), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "actions_applied",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "dry_run", sa.Boolean(), nullable=False, server_default=sa.false(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_rule_executions_tenant_id", "rule_executions", ["tenant_id"],
    )
    op.create_index(
        "ix_rule_executions_rule_id", "rule_executions", ["rule_id"],
    )
    op.create_index(
        "ix_rule_executions_event_id", "rule_executions", ["event_id"],
    )
    op.create_index(
        "ix_rule_executions_customer_id",
        "rule_executions", ["customer_id"],
    )
    op.create_index(
        "ix_rule_execution_rule_id_created",
        "rule_executions",
        ["rule_id", "created_at"],
    )
    op.create_index(
        "ix_rule_execution_rule_customer_status_created",
        "rule_executions",
        ["rule_id", "customer_id", "status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_rule_execution_rule_customer_status_created",
        table_name="rule_executions",
    )
    op.drop_index(
        "ix_rule_execution_rule_id_created", table_name="rule_executions",
    )
    op.drop_index("ix_rule_executions_customer_id", table_name="rule_executions")
    op.drop_index("ix_rule_executions_event_id", table_name="rule_executions")
    op.drop_index("ix_rule_executions_rule_id", table_name="rule_executions")
    op.drop_index("ix_rule_executions_tenant_id", table_name="rule_executions")
    op.drop_table("rule_executions")

    op.drop_index("ix_rule_versions_rule_id", table_name="rule_versions")
    op.drop_index("ix_rule_versions_tenant_id", table_name="rule_versions")
    op.drop_table("rule_versions")

    op.drop_index("ix_rule_tenant_trigger_enabled", table_name="rules")
    op.drop_index("ix_rules_tenant_id", table_name="rules")
    op.drop_table("rules")
