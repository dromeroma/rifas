"""lock_ticket_identity_and_global_code_uniqueness

Revision ID: d5775519ac16
Revises: cb4cd4186bc9
Create Date: 2026-05-20 19:54:47.959558

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5775519ac16'
down_revision: Union[str, None] = 'cb4cd4186bc9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Reemplaza el índice no único existente sobre tickets.code por una
    #    restricción UNIQUE global. Esto garantiza que ningún código se pueda
    #    repetir entre boletas, ni siquiera de rifas diferentes.
    op.drop_index("ix_tickets_code", table_name="tickets")
    op.create_unique_constraint("uq_tickets_code", "tickets", ["code"])

    # 2. Trigger Postgres que impide cambiar la identidad de una boleta una
    #    vez creada (code, number_label, raffle_id). Si X pertenece a la
    #    boleta 40 de la rifa 1, ese código no podrá moverse a otra boleta.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_ticket_identity_change()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.code IS DISTINCT FROM OLD.code THEN
                RAISE EXCEPTION
                    'el código de una boleta es inmutable (ticket id=%, viejo=%, nuevo=%)',
                    OLD.id, OLD.code, NEW.code;
            END IF;
            IF NEW.number_label IS DISTINCT FROM OLD.number_label THEN
                RAISE EXCEPTION
                    'el número/label de una boleta es inmutable (ticket id=%)',
                    OLD.id;
            END IF;
            IF NEW.raffle_id IS DISTINCT FROM OLD.raffle_id THEN
                RAISE EXCEPTION
                    'una boleta no se puede mover de rifa (ticket id=%)',
                    OLD.id;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS tickets_prevent_identity_change ON tickets")
    op.execute(
        """
        CREATE TRIGGER tickets_prevent_identity_change
            BEFORE UPDATE ON tickets
            FOR EACH ROW
            EXECUTE FUNCTION prevent_ticket_identity_change()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tickets_prevent_identity_change ON tickets;")
    op.execute("DROP FUNCTION IF EXISTS prevent_ticket_identity_change();")
    op.drop_constraint("uq_tickets_code", "tickets", type_="unique")
    op.create_index("ix_tickets_code", "tickets", ["code"], unique=False)
