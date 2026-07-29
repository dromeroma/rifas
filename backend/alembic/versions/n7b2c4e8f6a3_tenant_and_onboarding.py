"""tenant profile + onboarding steps (aditivas)

Sprint 8 de Fase 1. Módulos tenant + onboarding. Solo CREATE TABLE
+ índices — cumple ADR-007.

Revision ID: n7b2c4e8f6a3
Revises: m6a1b3d7e5f2
Create Date: 2026-07-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n7b2c4e8f6a3"
down_revision: Union[str, None] = "m6a1b3d7e5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── tenant_profile (one-to-one con tenants) ─────────
    op.create_table(
        "tenant_profile",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("brand_name", sa.String(length=120), nullable=True),
        sa.Column("brand_color_primary", sa.String(length=9), nullable=True),
        sa.Column("brand_color_secondary", sa.String(length=9), nullable=True),
        sa.Column("brand_logo_url", sa.String(length=500), nullable=True),
        sa.Column("vertical", sa.String(length=30), nullable=True),
        sa.Column(
            "timezone",
            sa.String(length=60),
            nullable=False,
            server_default="America/Bogota",
        ),
        sa.Column(
            "locale",
            sa.String(length=10),
            nullable=False,
            server_default="es-CO",
        ),
        sa.Column(
            "currency",
            sa.String(length=3),
            nullable=False,
            server_default="COP",
        ),
        sa.Column("contact_email", sa.String(length=180), nullable=True),
        sa.Column("contact_phone", sa.String(length=40), nullable=True),
        sa.Column("support_url", sa.String(length=500), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_by", sa.String(length=80), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "config",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_profile_tenant"),
    )

    # ── onboarding_steps ────────────────────────────────
    op.create_table(
        "onboarding_steps",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_key", sa.String(length=60), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", sa.String(length=80), nullable=True),
        sa.Column("trigger_event_id", sa.String(length=40), nullable=True),
        sa.Column(
            "metadata",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenant_id", "step_key",
            name="uq_onboarding_step_tenant_key",
        ),
    )
    op.create_index(
        "ix_onboarding_steps_tenant_id",
        "onboarding_steps", ["tenant_id"],
    )
    op.create_index(
        "ix_onboarding_step_tenant_status",
        "onboarding_steps", ["tenant_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_onboarding_step_tenant_status", table_name="onboarding_steps")
    op.drop_index("ix_onboarding_steps_tenant_id", table_name="onboarding_steps")
    op.drop_table("onboarding_steps")
    op.drop_table("tenant_profile")
