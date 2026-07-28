"""wallet: wallets + balances + ledger + vouchers (aditivas)

Cuatro tablas nuevas del módulo wallet. Cero cambios en tablas
existentes — cumple ADR-007.

Estructura:
  wallets           · una por (customer, tenant), UNIQUE compuesto.
  wallet_balances   · snapshot por (wallet, balance_type), UNIQUE compuesto.
  wallet_ledger     · append-only, índice por wallet+type+id para el
                      historial y por related_event_id para trazabilidad
                      inversa contra el event bus.
  wallet_vouchers   · cupones vivos, code único por tenant, índice por
                      customer+state para vouchers activos.

Revision ID: k4e8g5b3c2d9
Revises: j3d7f4a2b1c8
Create Date: 2026-07-28 22:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k4e8g5b3c2d9"
down_revision: Union[str, None] = "j3d7f4a2b1c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── wallets ────────────────────────────────────────────────
    op.create_table(
        "wallets",
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
            "tenant_id", "customer_id", name="uq_wallet_tenant_customer",
        ),
    )
    op.create_index("ix_wallets_tenant_id", "wallets", ["tenant_id"])
    op.create_index("ix_wallets_customer_id", "wallets", ["customer_id"])

    # ── wallet_balances ────────────────────────────────────────
    op.create_table(
        "wallet_balances",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "wallet_id",
            sa.BigInteger(),
            sa.ForeignKey("wallets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("balance_type", sa.String(length=40), nullable=False),
        sa.Column(
            "amount",
            sa.Numeric(precision=18, scale=4),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "wallet_id", "balance_type", name="uq_wallet_balance_type",
        ),
    )
    op.create_index(
        "ix_wallet_balances_tenant_id", "wallet_balances", ["tenant_id"],
    )
    op.create_index(
        "ix_wallet_balances_wallet_id", "wallet_balances", ["wallet_id"],
    )

    # ── wallet_ledger (append-only) ────────────────────────────
    op.create_table(
        "wallet_ledger",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "wallet_id",
            sa.BigInteger(),
            sa.ForeignKey("wallets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("balance_type", sa.String(length=40), nullable=False),
        sa.Column("delta", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column(
            "balance_after", sa.Numeric(precision=18, scale=4), nullable=False,
        ),
        sa.Column("cause", sa.String(length=40), nullable=False),
        sa.Column("cause_ref", sa.String(length=80), nullable=True),
        sa.Column("related_event_id", sa.String(length=40), nullable=True),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_wallet_ledger_tenant_id", "wallet_ledger", ["tenant_id"])
    op.create_index("ix_wallet_ledger_wallet_id", "wallet_ledger", ["wallet_id"])
    op.create_index(
        "ix_wallet_ledger_wallet_type_id",
        "wallet_ledger",
        ["wallet_id", "balance_type", "id"],
    )
    op.create_index(
        "ix_wallet_ledger_related_event",
        "wallet_ledger",
        ["related_event_id"],
    )

    # ── wallet_vouchers ────────────────────────────────────────
    op.create_table(
        "wallet_vouchers",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "wallet_id",
            sa.BigInteger(),
            sa.ForeignKey("wallets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=60), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "conditions_snapshot",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "state",
            sa.String(length=20),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "origin",
            sa.String(length=40),
            nullable=False,
            server_default="manual",
        ),
        sa.Column("origin_ref", sa.String(length=80), nullable=True),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "tenant_id", "code", name="uq_wallet_voucher_tenant_code",
        ),
    )
    op.create_index(
        "ix_wallet_vouchers_tenant_id", "wallet_vouchers", ["tenant_id"],
    )
    op.create_index(
        "ix_wallet_vouchers_wallet_id", "wallet_vouchers", ["wallet_id"],
    )
    op.create_index(
        "ix_wallet_vouchers_customer_id", "wallet_vouchers", ["customer_id"],
    )
    op.create_index(
        "ix_wallet_vouchers_state", "wallet_vouchers", ["state"],
    )
    op.create_index(
        "ix_wallet_voucher_customer_state",
        "wallet_vouchers",
        ["customer_id", "state", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_wallet_voucher_customer_state", table_name="wallet_vouchers")
    op.drop_index("ix_wallet_vouchers_state", table_name="wallet_vouchers")
    op.drop_index("ix_wallet_vouchers_customer_id", table_name="wallet_vouchers")
    op.drop_index("ix_wallet_vouchers_wallet_id", table_name="wallet_vouchers")
    op.drop_index("ix_wallet_vouchers_tenant_id", table_name="wallet_vouchers")
    op.drop_table("wallet_vouchers")

    op.drop_index("ix_wallet_ledger_related_event", table_name="wallet_ledger")
    op.drop_index("ix_wallet_ledger_wallet_type_id", table_name="wallet_ledger")
    op.drop_index("ix_wallet_ledger_wallet_id", table_name="wallet_ledger")
    op.drop_index("ix_wallet_ledger_tenant_id", table_name="wallet_ledger")
    op.drop_table("wallet_ledger")

    op.drop_index("ix_wallet_balances_wallet_id", table_name="wallet_balances")
    op.drop_index("ix_wallet_balances_tenant_id", table_name="wallet_balances")
    op.drop_table("wallet_balances")

    op.drop_index("ix_wallets_customer_id", table_name="wallets")
    op.drop_index("ix_wallets_tenant_id", table_name="wallets")
    op.drop_table("wallets")
