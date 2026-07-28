"""platform.flags: feature_flags table

Feature flags DB-based con TTL declarativo. Ver ADR-007.

Aditivo, reversible. Índice parcial para forzar unicidad del flag global
(cuando tenant_id IS NULL) — Postgres considera NULL != NULL en UNIQUE
constraints normales, así que necesitamos el índice parcial.

Revision ID: i2b6c7d1a5e9
Revises: h1a5f3c8e94b
Create Date: 2026-07-27 20:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i2b6c7d1a5e9"
down_revision: Union[str, None] = "h1a5f3c8e94b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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
            "tenant_id", "name", name="uq_feature_flags_tenant_name",
        ),
    )
    op.create_index(
        "ix_feature_flags_tenant_id", "feature_flags", ["tenant_id"],
    )
    op.create_index("ix_feature_flags_name", "feature_flags", ["name"])
    # Unicidad global cuando tenant_id IS NULL.
    op.create_index(
        "ix_feature_flags_global_name",
        "feature_flags",
        ["name"],
        unique=True,
        postgresql_where=sa.text("tenant_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_feature_flags_global_name", table_name="feature_flags")
    op.drop_index("ix_feature_flags_name", table_name="feature_flags")
    op.drop_index("ix_feature_flags_tenant_id", table_name="feature_flags")
    op.drop_table("feature_flags")
