"""tenant_pre_expiry_notification

Revision ID: dcb72be2b36a
Revises: 739df2ece9ea
Create Date: 2026-05-21 20:01:30.413271

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'dcb72be2b36a'
down_revision: Union[str, None] = '739df2ece9ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("last_pre_expiry_notification_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "last_pre_expiry_notification_days")
