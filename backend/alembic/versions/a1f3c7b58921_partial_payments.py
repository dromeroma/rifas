"""partial_payments: ticket.paid_amount + ticketstatus.partially_paid

Soporta pagos fraccionados: un mismo ticket puede tener N pagos confirmados
hasta cubrir el precio total. Mientras esté incompleto, el ticket vive en
estado `partially_paid`. Al completar el total, pasa a `paid` y se genera
la comisión del vendedor.

Revision ID: a1f3c7b58921
Revises: 64b440754ead
Create Date: 2026-05-22 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1f3c7b58921'
down_revision: Union[str, None] = '64b440754ead'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Nuevo valor en el enum ticketstatus. Postgres 12+ permite ADD VALUE
    #    dentro de una transacción siempre que el nuevo valor NO se use en la
    #    misma transacción. Esta migración solo añade la columna y hace backfill
    #    con valores existentes, sin tocar 'partially_paid' → es seguro inline.
    op.execute("ALTER TYPE ticketstatus ADD VALUE IF NOT EXISTS 'partially_paid' AFTER 'pending_payment'")

    # 2) Columna paid_amount en tickets (suma de pagos CONFIRMED). Backfill:
    #    tickets en estado 'paid' o 'winning' ya cubrieron el total → set al
    #    ticket_price de su rifa. El resto queda en 0.
    op.add_column(
        'tickets',
        sa.Column('paid_amount', sa.Numeric(12, 2), nullable=False, server_default='0'),
    )
    op.execute("""
        UPDATE tickets t
        SET paid_amount = r.ticket_price
        FROM raffles r
        WHERE t.raffle_id = r.id
          AND t.status IN ('paid', 'winning')
    """)
    op.alter_column('tickets', 'paid_amount', server_default=None)


def downgrade() -> None:
    op.drop_column('tickets', 'paid_amount')
    # No se puede remover un valor de un enum en Postgres sin recrearlo;
    # dejamos `partially_paid` en el tipo (no afecta integridad).
