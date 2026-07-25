"""raffle.reservations_close_at

Cierre absoluto de reservas configurable por rifa. Cuando está seteado,
`_is_locked` usa este instante en vez del lock automático de N días
antes de cada sorteo. Permite mantener las ventas abiertas más cerca de
la fecha del sorteo cuando el admin lo decide.

Revision ID: g8d4e2a15c73
Revises: c3f8a1b45e29
Create Date: 2026-07-25 20:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g8d4e2a15c73"
down_revision: Union[str, None] = "c3f8a1b45e29"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "raffles",
        sa.Column(
            "reservations_close_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("raffles", "reservations_close_at")
