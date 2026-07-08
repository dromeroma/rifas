"""
Modelos para el flujo de VENTA PÚBLICA ONLINE.

Contiene:
  - WompiTransaction / WompiTransactionTicket (M:N)
  - CustomerAuthToken (magic link portal cliente)
  - ManualTransferSubmission (transferencia con comprobante)
  - Referral (programa de referidos)

Todos participan del mismo mundo: cliente entra al portal público,
elige boletas, paga → tickets se marcan y el cliente puede ver su
compra desde /mi-cuenta.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base_mixins import TimestampMixin


class WompiTransaction(Base):
    """Registro de un intento de pago vía Wompi.

    Se crea al momento de generar el checkout link (status=PENDING). Se
    actualiza cuando llega el webhook con el resultado real (APPROVED,
    DECLINED, etc.).

    El campo `reference` es único e idempotente — sirve para vincular la
    respuesta de Wompi con nuestro registro. Formato:
        BOL-{raffle_id}-{customer_id}-{uuid8}
    """
    __tablename__ = "wompi_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    raffle_id: Mapped[int] = mapped_column(
        ForeignKey("raffles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    # Reference único (nosotros lo generamos y se lo pasamos a Wompi).
    reference: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    # ID que Wompi asigna cuando procesa. NULL hasta primer webhook.
    wompi_transaction_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)

    # Wompi trabaja en centavos (COP tiene 2 decimales pero se manda como int).
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="COP")

    # PENDING | APPROVED | DECLINED | VOIDED | ERROR | EXPIRED
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True)
    payment_method_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    checkout_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Snapshot del último payload del webhook (para auditar disputas).
    payload_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    signature_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="CURRENT_TIMESTAMP",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="CURRENT_TIMESTAMP",
    )


class WompiTransactionTicket(Base):
    """Relación M:N entre pagos Wompi y tickets. Una transacción puede
    cubrir varias boletas (cliente compra 3 boletas en un solo checkout)."""
    __tablename__ = "wompi_transaction_tickets"

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("wompi_transactions.id", ondelete="CASCADE"), primary_key=True,
    )
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True,
    )


class CustomerAuthToken(Base):
    """Magic link token para autenticación del cliente en el portal público.

    Guardamos solo el HASH (SHA-256) del token — el token plano solo vive
    en el link enviado al email/whatsapp. Un solo uso, expiración corta.
    """
    __tablename__ = "customer_auth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # 'magic_link' o 'email_verify'
    purpose: Mapped[str] = mapped_column(String(30), nullable=False, default="magic_link")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="CURRENT_TIMESTAMP",
    )


class ManualTransferSubmission(Base):
    """Envío de comprobante de transferencia manual (Nequi/Daviplata/etc).

    El cliente sube una foto/PDF del comprobante y el admin lo aprueba
    o rechaza. Al aprobar, los tickets se marcan como PAID.
    """
    __tablename__ = "manual_transfer_submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    raffle_id: Mapped[int] = mapped_column(
        ForeignKey("raffles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    # IDs de los tickets a los que aplica este comprobante (list de ints)
    ticket_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    amount_declared: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    # NEQUI | DAVIPLATA | BANCOLOMBIA_TRANSFER | OTHER
    payment_method: Mapped[str] = mapped_column(String(30), nullable=False)
    # URL de imagen/PDF del comprobante (Supabase storage o similar).
    proof_url: Mapped[str] = mapped_column(String(500), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # PENDING | APPROVED | REJECTED
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING", index=True)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="CURRENT_TIMESTAMP",
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Referral(Base):
    """Vínculo cliente → cliente para el programa de referidos.

    Se crea cuando un nuevo cliente entra al portal usando el link de
    otro cliente. `reward_status` cambia a GRANTED cuando el referido
    hace su primera compra pagada (dispara descuento/recompensa para
    el referidor).
    """
    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(primary_key=True)
    referrer_customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    # Un cliente solo puede ser referido una vez (unique constraint).
    referred_customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True, unique=True,
    )
    referral_code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    first_purchase_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # NONE | PENDING | GRANTED
    reward_status: Mapped[str] = mapped_column(String(20), nullable=False, default="NONE")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default="CURRENT_TIMESTAMP",
    )
