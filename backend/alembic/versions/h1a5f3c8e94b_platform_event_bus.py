"""platform.events: outbox + handled tables + notify trigger

Cimientos del event bus interno de Savvy Perks.

Aditivo, reversible, no toca tablas existentes:
  - event_outbox: cola durable de eventos por procesar.
  - event_handled: idempotencia por (event_id, handler_id).
  - Trigger AFTER INSERT en event_outbox → pg_notify('savvy_events').
  - Enums outbox_status y handled_status (nullable=False, native_enum=False,
    almacenados como VARCHAR — más flexibles para roll-forward que
    Postgres native enums).

Revision ID: h1a5f3c8e94b
Revises: g8d4e2a15c73
Create Date: 2026-07-26 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h1a5f3c8e94b"
down_revision: Union[str, None] = "g8d4e2a15c73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NOTIFY_CHANNEL = "savvy_events"


def upgrade() -> None:
    # ── event_outbox ────────────────────────────────────────────
    op.create_table(
        "event_outbox",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("event_id", sa.String(length=40), nullable=False, unique=True),
        sa.Column("type", sa.String(length=120), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("subject", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column(
            "context",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "data",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("idempotency_key", sa.String(length=120), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_event_outbox_event_id", "event_outbox", ["event_id"], unique=True,
    )
    op.create_index("ix_event_outbox_type", "event_outbox", ["type"])
    op.create_index("ix_event_outbox_tenant_id", "event_outbox", ["tenant_id"])
    op.create_index("ix_event_outbox_occurred_at", "event_outbox", ["occurred_at"])
    op.create_index("ix_event_outbox_status", "event_outbox", ["status"])
    op.create_index(
        "ix_event_outbox_idempotency_key", "event_outbox", ["idempotency_key"],
    )
    op.create_index(
        "ix_event_outbox_status_id", "event_outbox", ["status", "id"],
    )

    # ── event_handled ───────────────────────────────────────────
    op.create_table(
        "event_handled",
        sa.Column("event_id", sa.String(length=40), primary_key=True),
        sa.Column("handler_id", sa.String(length=200), primary_key=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "handled_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_event_handled_status", "event_handled", ["status"])

    # ── pg_notify trigger ───────────────────────────────────────
    # Cada INSERT nuevo en event_outbox notifica al dispatcher —
    # evita polling y da latencia sub-segundo.
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION savvy_notify_event_outbox()
        RETURNS trigger AS $$
        BEGIN
            PERFORM pg_notify(
                '{NOTIFY_CHANNEL}',
                json_build_object('id', NEW.id, 'event_id', NEW.event_id)::text
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_event_outbox_notify
        AFTER INSERT ON event_outbox
        FOR EACH ROW EXECUTE FUNCTION savvy_notify_event_outbox();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_event_outbox_notify ON event_outbox;")
    op.execute("DROP FUNCTION IF EXISTS savvy_notify_event_outbox();")

    op.drop_index("ix_event_handled_status", table_name="event_handled")
    op.drop_table("event_handled")

    for idx in (
        "ix_event_outbox_status_id",
        "ix_event_outbox_idempotency_key",
        "ix_event_outbox_status",
        "ix_event_outbox_occurred_at",
        "ix_event_outbox_tenant_id",
        "ix_event_outbox_type",
        "ix_event_outbox_event_id",
    ):
        op.drop_index(idx, table_name="event_outbox")
    op.drop_table("event_outbox")
