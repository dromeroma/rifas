"""customer: identities + preferences + consents (aditivas)

Cimientos del módulo customer nuevo. Tres tablas aditivas que extienden
la tabla `customers` legacy — cero cambios en el esquema existente.

  customer_identities   · N identities por customer (email, phone,
                          document, external_id).
  customer_preferences  · opt-in por canal (email/sms/whatsapp/push).
  customer_consents     · append-only, Habeas Data / GDPR.

Cumple ADR-007: solo CREATE TABLE + CREATE INDEX. Reversible.

Revision ID: j3d7f4a2b1c8
Revises: i2b6c7d1a5e9
Create Date: 2026-07-28 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j3d7f4a2b1c8"
down_revision: Union[str, None] = "i2b6c7d1a5e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── customer_identities ────────────────────────────────────
    op.create_table(
        "customer_identities",
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
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("value", sa.String(length=200), nullable=False),
        sa.Column("value_normalized", sa.String(length=200), nullable=False),
        sa.Column(
            "verified", sa.Boolean(), nullable=False, server_default=sa.false(),
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verification_source", sa.String(length=50), nullable=True),
        sa.Column("source", sa.String(length=60), nullable=True),
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
            "tenant_id", "kind", "value_normalized",
            name="uq_customer_identity_tenant_kind_value",
        ),
    )
    op.create_index(
        "ix_customer_identities_tenant_id",
        "customer_identities", ["tenant_id"],
    )
    op.create_index(
        "ix_customer_identities_customer_id",
        "customer_identities", ["customer_id"],
    )
    op.create_index(
        "ix_customer_identity_customer_kind",
        "customer_identities", ["customer_id", "kind"],
    )

    # ── customer_preferences ────────────────────────────────────
    op.create_table(
        "customer_preferences",
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
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column(
            "allowed", sa.Boolean(), nullable=False, server_default=sa.true(),
        ),
        sa.Column(
            "settings",
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
            "tenant_id", "customer_id", "channel",
            name="uq_customer_preference_channel",
        ),
    )
    op.create_index(
        "ix_customer_preferences_tenant_id",
        "customer_preferences", ["tenant_id"],
    )
    op.create_index(
        "ix_customer_preferences_customer_id",
        "customer_preferences", ["customer_id"],
    )

    # ── customer_consents (append-only) ─────────────────────────
    op.create_table(
        "customer_consents",
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
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=60), nullable=False),
        sa.Column(
            "evidence",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("policy_version", sa.String(length=40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_customer_consents_tenant_id",
        "customer_consents", ["tenant_id"],
    )
    op.create_index(
        "ix_customer_consents_customer_id",
        "customer_consents", ["customer_id"],
    )
    op.create_index(
        "ix_customer_consent_customer_purpose",
        "customer_consents",
        ["customer_id", "purpose", "granted_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_customer_consent_customer_purpose", table_name="customer_consents",
    )
    op.drop_index("ix_customer_consents_customer_id", table_name="customer_consents")
    op.drop_index("ix_customer_consents_tenant_id", table_name="customer_consents")
    op.drop_table("customer_consents")

    op.drop_index("ix_customer_preferences_customer_id", table_name="customer_preferences")
    op.drop_index("ix_customer_preferences_tenant_id", table_name="customer_preferences")
    op.drop_table("customer_preferences")

    op.drop_index("ix_customer_identity_customer_kind", table_name="customer_identities")
    op.drop_index("ix_customer_identities_customer_id", table_name="customer_identities")
    op.drop_index("ix_customer_identities_tenant_id", table_name="customer_identities")
    op.drop_table("customer_identities")
