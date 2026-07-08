"""public_sales_wompi_referrals

Revision ID: c3f8a1b45e29
Revises: b2c4a91d7e35
Create Date: 2026-07-07 20:00:00.000000

Fundacional para el modo VENTA PÚBLICA ONLINE:
  - Rifas pueden ser públicas y aceptar compra directa por el cliente.
  - Pago por Wompi (checkout link) o transferencia manual con comprobante.
  - Auth cliente por magic link (email).
  - Threshold para disparar sorteo (default 80% pagado) con notificación
    al admin.
  - Programa de referidos (código único por cliente).

Cambios de schema:
  raffles:
    + is_public               (bool, default false)
    + enable_online_purchase  (bool, default false)   → Wompi
    + enable_manual_transfer  (bool, default false)   → transferencia manual
    + draw_threshold_pct      (int,  default 80)
    + draw_notified_at        (datetime nullable)
    + draw_date_scheduled     (bool, default false)   → true cuando el admin
                                                        confirma la fecha
    + public_welcome_message  (text nullable)         → mensaje personalizable

  tenants:
    + wompi_public_key        (str nullable)
    + wompi_private_key_enc   (str nullable)   → ENCRIPTADO (usa Fernet key)
    + wompi_webhook_secret    (str nullable)
    + wompi_integrity_key     (str nullable)
    + wompi_env               (str default 'sandbox')  → sandbox|production
    + brand_logo_url          (str nullable)
    + brand_primary_color     (str nullable)
    + contact_whatsapp        (str nullable)
    + email_from              (str nullable)
    + terms_url               (str nullable)

  customers:
    + email_verified          (bool, default false)
    + referred_by_customer_id (int nullable, FK customers)
    + referral_code           (str unique nullable)

Tablas nuevas:
  wompi_transactions:
    Registro completo de cada intento de pago Wompi. Idempotente por
    reference. Cambia de estado en función de la respuesta del webhook.

  wompi_transaction_tickets:
    Tabla puente M:N — un pago puede cubrir varios tickets (comprar 3
    boletas en un solo checkout).

  customer_auth_tokens:
    Magic-link tokens para el portal cliente. Un solo uso, expiración
    corta (15 min). Guardamos solo el hash (SHA-256).

  manual_transfer_submissions:
    Cuando el cliente elige "transferir yo mismo" en vez de pagar por
    Wompi. Sube un comprobante y espera aprobación del admin.

  referrals:
    Cuando un cliente compra usando un código de referido de otro
    cliente. Sirve para tracking del programa de recompensas.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c3f8a1b45e29'
down_revision: Union[str, None] = 'b2c4a91d7e35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --------------- raffles ---------------
    op.add_column('raffles', sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('raffles', sa.Column('enable_online_purchase', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('raffles', sa.Column('enable_manual_transfer', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('raffles', sa.Column('draw_threshold_pct', sa.Integer(), nullable=False, server_default='80'))
    op.add_column('raffles', sa.Column('draw_notified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('raffles', sa.Column('draw_date_scheduled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('raffles', sa.Column('public_welcome_message', sa.Text(), nullable=True))

    # --------------- tenants ---------------
    op.add_column('tenants', sa.Column('wompi_public_key', sa.String(255), nullable=True))
    op.add_column('tenants', sa.Column('wompi_private_key_enc', sa.String(1024), nullable=True))
    op.add_column('tenants', sa.Column('wompi_webhook_secret', sa.String(255), nullable=True))
    op.add_column('tenants', sa.Column('wompi_integrity_key', sa.String(255), nullable=True))
    op.add_column('tenants', sa.Column('wompi_env', sa.String(20), nullable=False, server_default='sandbox'))
    op.add_column('tenants', sa.Column('brand_logo_url', sa.String(500), nullable=True))
    op.add_column('tenants', sa.Column('brand_primary_color', sa.String(20), nullable=True))
    op.add_column('tenants', sa.Column('contact_whatsapp', sa.String(30), nullable=True))
    op.add_column('tenants', sa.Column('email_from', sa.String(200), nullable=True))
    op.add_column('tenants', sa.Column('terms_url', sa.String(500), nullable=True))

    # --------------- customers ---------------
    op.add_column('customers', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('customers', sa.Column('referred_by_customer_id', sa.Integer(), nullable=True))
    op.add_column('customers', sa.Column('referral_code', sa.String(20), nullable=True))
    op.create_foreign_key(
        'fk_customers_referred_by_customer_id',
        'customers', 'customers',
        ['referred_by_customer_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_unique_constraint('uq_customers_referral_code', 'customers', ['referral_code'])
    op.create_index('ix_customers_email_verified', 'customers', ['email_verified'])

    # --------------- wompi_transactions ---------------
    op.create_table(
        'wompi_transactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('raffle_id', sa.Integer(), sa.ForeignKey('raffles.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='SET NULL'), nullable=True, index=True),
        # Reference único para idempotencia. Formato: BOL-{raffle_id}-{customer_id}-{uuid[:8]}
        sa.Column('reference', sa.String(80), nullable=False, unique=True, index=True),
        # ID que Wompi asigna cuando la transacción se procesa. NULL hasta primer webhook.
        sa.Column('wompi_transaction_id', sa.String(80), nullable=True, index=True),
        sa.Column('amount_cents', sa.Integer(), nullable=False),  # Wompi trabaja en centavos COP
        sa.Column('currency', sa.String(3), nullable=False, server_default='COP'),
        # Estados: PENDING (esperando pago), APPROVED, DECLINED, VOIDED, ERROR, EXPIRED
        sa.Column('status', sa.String(30), nullable=False, server_default='PENDING', index=True),
        sa.Column('payment_method_type', sa.String(40), nullable=True),  # NEQUI, PSE, CARD, BANCOLOMBIA_TRANSFER, ...
        sa.Column('checkout_url', sa.String(500), nullable=True),
        # Snapshot del último payload del webhook para auditoría.
        sa.Column('payload_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('signature_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_wompi_transactions_status_created', 'wompi_transactions', ['status', 'created_at'])

    # M:N transaction ↔ tickets (un pago cubre varios boletas)
    op.create_table(
        'wompi_transaction_tickets',
        sa.Column('transaction_id', sa.Integer(), sa.ForeignKey('wompi_transactions.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('ticket_id', sa.Integer(), sa.ForeignKey('tickets.id', ondelete='CASCADE'), primary_key=True),
    )

    # --------------- customer_auth_tokens ---------------
    op.create_table(
        'customer_auth_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='CASCADE'), nullable=False, index=True),
        # Guardamos SHA-256 del token, no el token plano
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True, index=True),
        # 'magic_link' | 'email_verify'
        sa.Column('purpose', sa.String(30), nullable=False, server_default='magic_link'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_customer_auth_tokens_expires_at', 'customer_auth_tokens', ['expires_at'])

    # --------------- manual_transfer_submissions ---------------
    op.create_table(
        'manual_transfer_submissions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('raffle_id', sa.Integer(), sa.ForeignKey('raffles.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('ticket_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('amount_declared', sa.Numeric(12, 2), nullable=False),
        sa.Column('payment_method', sa.String(30), nullable=False),  # NEQUI, DAVIPLATA, BANCOLOMBIA_TRANSFER, OTHER
        sa.Column('proof_url', sa.String(500), nullable=False),
        sa.Column('reference', sa.String(80), nullable=True),
        # PENDING, APPROVED, REJECTED
        sa.Column('status', sa.String(20), nullable=False, server_default='PENDING', index=True),
        sa.Column('reviewed_by_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reviewer_notes', sa.Text(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    )

    # --------------- referrals ---------------
    op.create_table(
        'referrals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('referrer_customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('referred_customer_id', sa.Integer(), sa.ForeignKey('customers.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('referral_code', sa.String(20), nullable=False, index=True),
        sa.Column('first_purchase_at', sa.DateTime(timezone=True), nullable=True),
        # NONE, PENDING, GRANTED
        sa.Column('reward_status', sa.String(20), nullable=False, server_default='NONE'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_unique_constraint('uq_referrals_referred_customer_id', 'referrals', ['referred_customer_id'])


def downgrade() -> None:
    op.drop_table('referrals')
    op.drop_table('manual_transfer_submissions')
    op.drop_index('ix_customer_auth_tokens_expires_at', table_name='customer_auth_tokens')
    op.drop_table('customer_auth_tokens')
    op.drop_table('wompi_transaction_tickets')
    op.drop_index('ix_wompi_transactions_status_created', table_name='wompi_transactions')
    op.drop_table('wompi_transactions')

    op.drop_index('ix_customers_email_verified', table_name='customers')
    op.drop_constraint('uq_customers_referral_code', 'customers', type_='unique')
    op.drop_constraint('fk_customers_referred_by_customer_id', 'customers', type_='foreignkey')
    op.drop_column('customers', 'referral_code')
    op.drop_column('customers', 'referred_by_customer_id')
    op.drop_column('customers', 'email_verified')

    for col in ('terms_url', 'email_from', 'contact_whatsapp', 'brand_primary_color', 'brand_logo_url',
                'wompi_env', 'wompi_integrity_key', 'wompi_webhook_secret',
                'wompi_private_key_enc', 'wompi_public_key'):
        op.drop_column('tenants', col)

    for col in ('public_welcome_message', 'draw_date_scheduled', 'draw_notified_at',
                'draw_threshold_pct', 'enable_manual_transfer', 'enable_online_purchase', 'is_public'):
        op.drop_column('raffles', col)
