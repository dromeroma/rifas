"""add_ticket_theme_to_raffles

Revision ID: b2c4a91d7e35
Revises: f7c9e4d1a3b8
Create Date: 2026-09-23 10:00:00.000000

Agrega columna `ticket_theme` para escoger el diseño visual de las boletas
(cancha de fútbol, corazones románticos, etc.) sin tocar código por rifa.

Valores soportados al día de hoy:
  - 'soccer'   (default): cancha de fútbol con números en chips ovalados
  - 'romantic'          : fondo rosa con corazones y silueta de pareja
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c4a91d7e35'
down_revision: Union[str, None] = 'f7c9e4d1a3b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'raffles',
        sa.Column('ticket_theme', sa.String(length=20), nullable=False, server_default='soccer'),
    )


def downgrade() -> None:
    op.drop_column('raffles', 'ticket_theme')
