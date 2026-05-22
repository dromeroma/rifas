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
    # 1) Nuevo valor en el enum ticketstatus. SQLAlchemy guarda el .name del
    #    enum Python (UPPERCASE) por defecto, no el .value. Por eso los labels
    #    son AVAILABLE/RESERVED/PENDING_PAYMENT/... — el valor nuevo sigue ese
    #    mismo patrón. Postgres 12+ permite ADD VALUE en transacción mientras
    #    no se use el nuevo valor en la misma transacción (cumplido aquí).
    op.execute(
        "ALTER TYPE ticketstatus ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID' AFTER 'PENDING_PAYMENT'"
    )

    # 2) Columna paid_amount en tickets (suma de pagos CONFIRMED). Backfill:
    #    tickets en estado PAID o WINNING ya cubrieron el total → set al
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
          AND t.status IN ('PAID', 'WINNING')
    """)
    op.alter_column('tickets', 'paid_amount', server_default=None)


def downgrade() -> None:
    op.drop_column('tickets', 'paid_amount')
    # No se puede remover un valor de un enum en Postgres sin recrearlo;
    # dejamos `partially_paid` en el tipo (no afecta integridad).
