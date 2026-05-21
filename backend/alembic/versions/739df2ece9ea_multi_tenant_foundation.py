"""multi_tenant_foundation

Revision ID: 739df2ece9ea
Revises: d5775519ac16
Create Date: 2026-05-21 12:02:00.349719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '739df2ece9ea'
down_revision: Union[str, None] = 'd5775519ac16'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Crear tabla tenants
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("max_raffles", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("billing_email", sa.String(length=150), nullable=True),
        sa.Column("billing_phone", sa.String(length=30), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_unique_constraint("uq_tenants_slug", "tenants", ["slug"])
    op.create_index("ix_tenants_slug", "tenants", ["slug"])

    # Limpiar defaults a nivel de columna (gobernados por la app)
    op.alter_column("tenants", "max_raffles", server_default=None)
    op.alter_column("tenants", "is_active", server_default=None)

    # 2. Agregar tenant_id (nullable) a users, raffles, customers
    op.add_column("users", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("raffles", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("customers", sa.Column("tenant_id", sa.Integer(), nullable=True))

    # 3. Backfill: crear tenant "Demo Boletera" y asignar TODA la data actual
    #    a ese tenant. El super_admin actual (rol=super_admin) queda con
    #    tenant_id NULL (dueño global de Boletera).
    today = "CURRENT_DATE"
    op.execute(
        f"""
        INSERT INTO tenants (
            name, slug, start_date, end_date, max_raffles, is_active,
            billing_email, notes
        ) VALUES (
            'Demo Boletera', 'demo-boletera',
            {today}, ({today} + INTERVAL '1 year')::date,
            10, TRUE,
            'deimerromeromadera@gmail.com',
            'Tenant inicial creado al migrar a multi-tenant. Contiene toda la data previa a v0.2.0.'
        )
        """
    )

    # Asociar usuarios NO super_admin al tenant demo
    op.execute(
        """
        UPDATE users
        SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-boletera')
        WHERE role != 'SUPER_ADMIN'
        """
    )

    # Asociar TODAS las rifas y TODOS los customers al tenant demo
    op.execute(
        """
        UPDATE raffles
        SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-boletera')
        """
    )
    op.execute(
        """
        UPDATE customers
        SET tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-boletera')
        """
    )

    # 4. FK constraints
    op.create_foreign_key(
        "fk_users_tenant", "users", "tenants",
        ["tenant_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_raffles_tenant", "raffles", "tenants",
        ["tenant_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_customers_tenant", "customers", "tenants",
        ["tenant_id"], ["id"], ondelete="CASCADE",
    )

    # 5. Hacer NOT NULL donde aplica (raffles y customers; users queda
    #    nullable para super_admin global)
    op.alter_column("raffles", "tenant_id", nullable=False)
    op.alter_column("customers", "tenant_id", nullable=False)

    # 6. Índices para filtrado por tenant
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_index("ix_raffles_tenant_id", "raffles", ["tenant_id"])
    op.create_index("ix_customers_tenant_id", "customers", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_customers_tenant_id", table_name="customers")
    op.drop_index("ix_raffles_tenant_id", table_name="raffles")
    op.drop_index("ix_users_tenant_id", table_name="users")

    op.drop_constraint("fk_customers_tenant", "customers", type_="foreignkey")
    op.drop_constraint("fk_raffles_tenant", "raffles", type_="foreignkey")
    op.drop_constraint("fk_users_tenant", "users", type_="foreignkey")

    op.drop_column("customers", "tenant_id")
    op.drop_column("raffles", "tenant_id")
    op.drop_column("users", "tenant_id")

    op.drop_index("ix_tenants_slug", table_name="tenants")
    op.drop_constraint("uq_tenants_slug", "tenants", type_="unique")
    op.drop_table("tenants")
