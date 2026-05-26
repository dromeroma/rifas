"""add_printed_at_to_tickets

Revision ID: f7c9e4d1a3b8
Revises: a1f3c7b58921
Create Date: 2026-05-26 18:00:00.000000

Agrega columna `printed_at` para registrar cuándo se imprimió por última vez
el PDF físico de una boleta. Sirve para evitar reimpresiones accidentales y
para detectar talones duplicados en la calle.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7c9e4d1a3b8'
down_revision: Union[str, None] = 'a1f3c7b58921'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tickets',
        sa.Column('printed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('tickets', 'printed_at')
