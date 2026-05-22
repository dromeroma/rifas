"""raffle_mode_and_packages

Revision ID: 64b440754ead
Revises: dcb72be2b36a
Create Date: 2026-05-21 22:08:14.547949

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '64b440754ead'
down_revision: Union[str, None] = 'dcb72be2b36a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Modalidad de rifa: 'classic' (boletas con N números) o 'package'
    # (números individuales vendidos en paquetes estilo moto-Facebook).
    op.add_column(
        "raffles",
        sa.Column("mode", sa.String(length=20), nullable=False, server_default="classic"),
    )
    op.alter_column("raffles", "mode", server_default=None)

    # Solo aplica si mode='package':
    # Lista de paquetes: [{"size": 30, "price": 12000}, {"size": 50, "price": 20000}, ...]
    op.add_column(
        "raffles",
        sa.Column("package_options", sa.dialects.postgresql.JSONB(), nullable=True),
    )

    # Mínimo de paquete que el cliente puede comprar (tamaño en números).
    op.add_column(
        "raffles",
        sa.Column("min_package_size", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("raffles", "min_package_size")
    op.drop_column("raffles", "package_options")
    op.drop_column("raffles", "mode")
