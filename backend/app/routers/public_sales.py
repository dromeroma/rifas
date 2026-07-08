"""
Endpoints públicos para venta online (sin login vendedor).

Flujo principal (compra por Wompi):
  1. GET  /public/raffles/:id/available     → grid de números disponibles
  2. POST /public/raffles/:id/checkout      → crea reserva + tx Wompi + URL
  3. Cliente redirect a Wompi
  4. POST /public/wompi/webhook             → confirma pago, marca tickets
  5. Cliente redirect a /rifa/:id/pago/:ref → resultado

Flujo alternativo (transferencia manual):
  2b. POST /public/raffles/:id/manual-transfer → sube comprobante
  3b. Admin revisa desde /admin/transfers
  4b. Admin aprueba → tickets marcados como pagados

Portal cliente (magic link):
  POST /public/auth/request-link → email con link 15min
  POST /public/auth/consume      → intercambia token por session

Referidos:
  Al registrar cliente con ?ref=CODIGO → se crea Referral pending
  Al confirmar primer pago → reward_status pasa a PENDING/GRANTED
"""
from __future__ import annotations

import hashlib
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Integer, and_, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.customer import Customer
from app.models.public_sales import (
    CustomerAuthToken,
    ManualTransferSubmission,
    Referral,
    WompiTransaction,
    WompiTransactionTicket,
)
from app.models.raffle import Raffle
from app.models.reservation import Reservation
from app.models.ticket import Ticket, TicketStatus
from app.services import notification_service, wompi_service
from app.services.audit_service import log_action

router = APIRouter(prefix="/public", tags=["public-sales"])


RESERVATION_WINDOW_HOURS = 24
MAGIC_LINK_TTL_MINUTES = 15
MAX_CONCURRENT_RESERVATIONS_PER_CUSTOMER = 10


# ============================================================
# SCHEMAS
# ============================================================


class AvailableTicketOut(BaseModel):
    id: int
    number_label: str
    code: str  # para poder hacer preview via /verify/:code sin exponer más


class SellerInfoOut(BaseModel):
    """Info pública del vendedor cuando el cliente entra por su link
    personal (?v=<slug>). Solo campos NO sensibles."""
    full_name: str
    slug: str
    phone: str | None = None


class RafflePublicOverview(BaseModel):
    id: int
    name: str
    description: str | None
    logo_url: str | None
    primary_color: str | None
    lottery_name: str | None
    ticket_price: float
    total_tickets: int
    sold_pct: int
    is_public: bool
    enable_online_purchase: bool
    enable_manual_transfer: bool
    draw_date_scheduled: bool
    final_draw_date: str  # ISO
    show_draw_date: bool  # True cuando threshold alcanzado O admin la programó
    public_welcome_message: str | None
    prizes: list[dict]
    # Si el cliente entró por link personal de un vendedor (?v=<slug>),
    # se rellena con la info pública del vendedor. Null en pool general.
    seller: SellerInfoOut | None = None


class CheckoutRequest(BaseModel):
    ticket_ids: list[int] = Field(min_length=1, max_length=MAX_CONCURRENT_RESERVATIONS_PER_CUSTOMER)
    customer_document: str = Field(min_length=4, max_length=30)
    customer_name: str = Field(min_length=2, max_length=150)
    customer_email: EmailStr
    customer_phone: str = Field(min_length=7, max_length=30)
    customer_city: str | None = None
    referral_code: str | None = None  # si vino por link ?ref=XYZ
    seller_slug: str | None = None    # si vino por link ?v=<slug>


class CheckoutResponse(BaseModel):
    reference: str
    checkout_url: str | None      # None si el flujo es transferencia manual
    reservation_expires_at: str   # ISO
    ticket_labels: list[str]
    total_amount_cents: int


class ManualTransferRequest(BaseModel):
    ticket_ids: list[int] = Field(min_length=1, max_length=MAX_CONCURRENT_RESERVATIONS_PER_CUSTOMER)
    customer_document: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    amount_declared: float
    payment_method: str  # NEQUI, DAVIPLATA, BANCOLOMBIA_TRANSFER, OTHER
    proof_url: str       # URL previamente subida (frontend sube a Supabase storage)
    reference: str | None = None


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkConsumeRequest(BaseModel):
    token: str


class CustomerSessionOut(BaseModel):
    id: int
    full_name: str
    email: str | None
    phone: str
    document: str | None
    referral_code: str | None


# ============================================================
# HELPERS
# ============================================================


def _generate_reference(raffle_id: int, customer_id: int | None) -> str:
    """Reference único para la transacción Wompi. Legible y buscable."""
    tail = uuid.uuid4().hex[:8].upper()
    return f"BOL-{raffle_id}-{customer_id or 0}-{tail}"


def _generate_referral_code() -> str:
    """Código corto legible (sin caracteres ambiguos)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin I, O, 0, 1
    return "".join(secrets.choice(alphabet) for _ in range(8))


async def _find_or_create_customer(
    db: AsyncSession, tenant_id: int, *,
    full_name: str, email: str, phone: str, document: str, city: str | None = None,
) -> Customer:
    """Busca cliente por (tenant_id, document) o (tenant_id, email). Si no
    existe, lo crea. Si existe, actualiza campos vacíos."""
    q = select(Customer).where(
        Customer.tenant_id == tenant_id,
        or_(Customer.document == document, Customer.email == email),
    )
    existing = (await db.execute(q)).scalars().first()
    if existing:
        # Actualiza campos vacíos con la info nueva (no sobreescribe existentes)
        if not existing.email and email:
            existing.email = email
        if not existing.phone and phone:
            existing.phone = phone
        if not existing.full_name and full_name:
            existing.full_name = full_name
        if not existing.document and document:
            existing.document = document
        if city and not existing.city:
            existing.city = city
        return existing

    c = Customer(
        tenant_id=tenant_id,
        full_name=full_name,
        email=email,
        phone=phone,
        document=document,
        city=city,
    )
    db.add(c)
    await db.flush()
    return c


async def _link_referral(db: AsyncSession, customer: Customer, referral_code: str | None) -> None:
    """Si el customer es nuevo y viene con referral_code válido de OTRO
    cliente, crea el registro Referral (una vez por customer)."""
    if not referral_code:
        return
    # Ya tiene referral registrado?
    already = await db.scalar(
        select(exists().where(Referral.referred_customer_id == customer.id))
    )
    if already:
        return

    referrer = (await db.execute(
        select(Customer).where(
            Customer.referral_code == referral_code,
            Customer.tenant_id == customer.tenant_id,
        )
    )).scalars().first()
    if not referrer or referrer.id == customer.id:
        return

    db.add(Referral(
        referrer_customer_id=referrer.id,
        referred_customer_id=customer.id,
        referral_code=referral_code,
        reward_status="NONE",
    ))
    customer.referred_by_customer_id = referrer.id


async def _ensure_reservations(
    db: AsyncSession, tickets: list[Ticket], customer_id: int, seller_id: int | None = None,
) -> datetime:
    """Crea reservas de 24h para los tickets dados. Todos deben estar
    disponibles (available, sin seller humano, sin cliente)."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=RESERVATION_WINDOW_HOURS)

    for t in tickets:
        # Cuando la boleta se compra online, no hay vendedor humano.
        # Usamos NULL para seller_id — el flujo público es "sin vendedor".
        t.status = TicketStatus.RESERVED
        t.customer_id = customer_id

        db.add(Reservation(
            ticket_id=t.id,
            seller_id=seller_id,        # None → compra pública sin vendedor
            customer_id=customer_id,
            expires_at=expires_at,
            is_active=True,
        ))
    return expires_at


async def _raffle_sold_stats(db: AsyncSession, raffle_id: int) -> tuple[int, int, int]:
    """Retorna (total, paid, sold_pct) — pagadas / total * 100."""
    total = await db.scalar(
        select(func.count()).select_from(Ticket).where(Ticket.raffle_id == raffle_id)
    ) or 0
    paid = await db.scalar(
        select(func.count()).select_from(Ticket).where(
            Ticket.raffle_id == raffle_id,
            Ticket.status.in_([TicketStatus.PAID, TicketStatus.WINNING]),
        )
    ) or 0
    pct = int((paid / total) * 100) if total else 0
    return total, paid, pct


# ============================================================
# ENDPOINTS
# ============================================================


@router.get("/raffles/{raffle_id}/overview", response_model=RafflePublicOverview)
async def public_overview(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    v: str | None = Query(None, description="Slug del vendedor si vino por link personal"),
):
    """Info pública de la rifa: precio, %vendido, premios, fecha (si aplica).
    Sin autenticación. Solo devuelve datos NO sensibles.

    Si viene con `?v=<slug>`, agrega info del vendedor al response — el
    cliente ve "Vendido por: X" y las boletas se filtran al pool de
    ese vendedor."""
    raffle = (await db.execute(
        select(Raffle).where(Raffle.id == raffle_id)
    )).scalar_one_or_none()
    if not raffle or not raffle.is_public:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")

    # Si viene con slug de vendedor, obtenerlo
    from app.models.user import User, UserRole
    seller_info: SellerInfoOut | None = None
    if v:
        seller = (await db.execute(
            select(User).where(
                User.public_slug == v,
                User.role == UserRole.SELLER,
                User.tenant_id == raffle.tenant_id,
                User.is_active.is_(True),
            )
        )).scalar_one_or_none()
        if seller:
            seller_info = SellerInfoOut(
                full_name=seller.full_name,
                slug=seller.public_slug,
                phone=seller.phone,
            )

    total, paid, pct = await _raffle_sold_stats(db, raffle.id)

    # Solo mostrar fecha del sorteo si: threshold alcanzado O admin ya la programó.
    show_date = pct >= raffle.draw_threshold_pct or raffle.draw_date_scheduled

    from app.models.prize import Prize
    prizes_q = await db.execute(
        select(Prize).where(Prize.raffle_id == raffle.id).order_by(Prize.position)
    )
    prizes = [
        {
            "name": p.name,
            "position": p.position,
            "draw_date": p.draw_date.isoformat() if p.draw_date else None,
            "estimated_value": float(p.estimated_value) if p.estimated_value is not None else None,
        }
        for p in prizes_q.scalars().all()
    ]

    return RafflePublicOverview(
        id=raffle.id,
        name=raffle.name,
        description=raffle.description,
        logo_url=raffle.logo_url,
        primary_color=raffle.primary_color,
        lottery_name=raffle.lottery_name,
        ticket_price=float(raffle.ticket_price),
        total_tickets=total,
        sold_pct=pct,
        is_public=raffle.is_public,
        enable_online_purchase=raffle.enable_online_purchase,
        enable_manual_transfer=raffle.enable_manual_transfer,
        draw_date_scheduled=raffle.draw_date_scheduled,
        final_draw_date=raffle.final_draw_date.isoformat() if raffle.final_draw_date else "",
        show_draw_date=show_date,
        public_welcome_message=raffle.public_welcome_message,
        prizes=prizes,
        seller=seller_info,
    )


@router.get("/raffles/{raffle_id}/available", response_model=list[AvailableTicketOut])
async def public_available_tickets(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    v: str | None = Query(None, description="Slug del vendedor. Si viene, solo boletas de ese seller"),
):
    """Boletas disponibles al público. Dos modos:

    1. **Sin `v`** (pool general): boletas SIN vendedor humano asignado.
       - seller_id IS NULL, customer_id IS NULL, status = AVAILABLE.

    2. **Con `?v=<slug>`** (link personal del vendedor): boletas
       asignadas a ese vendedor específicamente y aún disponibles.
       - seller_id = <id del vendedor>, customer_id IS NULL,
         status = AVAILABLE.
    """
    raffle = (await db.execute(
        select(Raffle).where(Raffle.id == raffle_id, Raffle.is_public.is_(True))
    )).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")

    seller_filter = None
    if v:
        from app.models.user import User, UserRole
        seller = (await db.execute(
            select(User).where(
                User.public_slug == v,
                User.role == UserRole.SELLER,
                User.tenant_id == raffle.tenant_id,
                User.is_active.is_(True),
            )
        )).scalar_one_or_none()
        if not seller:
            # Slug inválido → devuelve pool vacío (frontend mostrará mensaje).
            return []
        seller_filter = seller.id

    q = select(Ticket).where(
        Ticket.raffle_id == raffle_id,
        Ticket.customer_id.is_(None),
        Ticket.status == TicketStatus.AVAILABLE,
    )
    if seller_filter is None:
        q = q.where(Ticket.seller_id.is_(None))
    else:
        q = q.where(Ticket.seller_id == seller_filter)

    q = q.order_by(Ticket.number_label).offset(skip).limit(limit)
    tickets = (await db.execute(q)).scalars().all()
    return [AvailableTicketOut(id=t.id, number_label=t.number_label, code=t.code) for t in tickets]


class TicketLookupOut(BaseModel):
    """Resultado de buscar un número dentro de los 20 números que juega
    cada boleta.

    status:
      - available  → el número está en una boleta disponible pública.
                     Devuelve ticket_id + number_label para seleccionarla.
      - reserved   → el número lo tiene una boleta reservada por otro comprador.
      - sold       → el número lo tiene una boleta ya pagada.
      - assigned   → el número lo tiene una boleta asignada a vendedor humano
                     (fuera del pool público).
      - not_found  → ese número no existe en ninguna boleta de la rifa.
    """
    status: str
    number_label: str      # label de la boleta que contiene el número (ej "241")
    matched_number: str    # el número que buscó el cliente (ej "6906")
    ticket_id: int | None = None
    message: str


@router.get("/raffles/{raffle_id}/lookup", response_model=TicketLookupOut)
async def public_lookup_ticket(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    number: str = Query(..., min_length=1, max_length=20,
                        description="Número a buscar dentro de los 20 números de cada boleta"),
):
    """Busca un número (ej '6906') DENTRO de los 20 números que juega cada
    boleta y devuelve la boleta que lo contiene junto con su estado
    (disponible / reservada / vendida / asignada).

    Tolera padding: '421', '0421', '00421' encuentran el mismo número si
    todos representan el mismo valor entero.
    """
    from app.models.ticket_number import TicketNumber

    raffle = (await db.execute(
        select(Raffle).where(Raffle.id == raffle_id, Raffle.is_public.is_(True))
    )).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")

    try:
        n = int(number.strip())
    except ValueError:
        return TicketLookupOut(
            status="not_found", number_label="", matched_number=number,
            message=f"'{number}' no es un número válido.",
        )
    if n < raffle.number_min or n > raffle.number_max:
        return TicketLookupOut(
            status="not_found", number_label="", matched_number=str(n),
            message=f"El número {n} está fuera del rango de la rifa "
                    f"({raffle.number_min}-{raffle.number_max}).",
        )

    # Busca en ticket_numbers.number (cast a integer para tolerar padding).
    row = (await db.execute(
        select(TicketNumber, Ticket)
        .join(Ticket, Ticket.id == TicketNumber.ticket_id)
        .where(
            TicketNumber.raffle_id == raffle_id,
            cast(TicketNumber.number, Integer) == n,
        )
        .limit(1)
    )).first()
    if not row:
        return TicketLookupOut(
            status="not_found", number_label="", matched_number=str(n),
            message=f"El número {n} no está en ninguna boleta de esta rifa.",
        )

    tn, t = row
    label = t.number_label
    matched = tn.number  # con padding original ("0421")

    # 1) Vendida
    if t.status in (TicketStatus.PAID, TicketStatus.WINNING):
        return TicketLookupOut(
            status="sold", number_label=label, matched_number=matched,
            message=f"El número {matched} está en la boleta {label}, "
                    f"pero ya fue vendida.",
        )
    # 2) Reservada
    if t.status in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT, TicketStatus.PARTIALLY_PAID):
        return TicketLookupOut(
            status="reserved", number_label=label, matched_number=matched,
            message=f"El número {matched} está en la boleta {label}, "
                    f"pero está reservada por otro comprador.",
        )
    # 3) Asignada a vendedor humano
    if t.seller_id is not None:
        return TicketLookupOut(
            status="assigned", number_label=label, matched_number=matched,
            message=f"El número {matched} está en la boleta {label}, "
                    f"que la vende un vendedor autorizado.",
        )
    # 4) Disponible pública
    if t.status == TicketStatus.AVAILABLE and t.customer_id is None:
        return TicketLookupOut(
            status="available", number_label=label, matched_number=matched,
            ticket_id=t.id,
            message=f"¡El número {matched} está en la boleta {label} y "
                    f"está disponible! Puedes reservarla ya.",
        )
    # Fallback (expired u otro)
    return TicketLookupOut(
        status="reserved", number_label=label, matched_number=matched,
        message=f"El número {matched} está en la boleta {label}, "
                f"pero no está disponible en este momento.",
    )


@router.post("/raffles/{raffle_id}/checkout", response_model=CheckoutResponse, status_code=201)
async def public_checkout(
    raffle_id: int,
    payload: CheckoutRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Inicia el proceso de compra pública:
      1. Verifica que las boletas estén realmente disponibles
      2. Crea/encuentra el customer
      3. Reserva las boletas por 24h
      4. Si el tenant tiene Wompi configurado → crea checkout_url
      5. Retorna la URL para redirigir al cliente

    Anti-fraude básico: máx 10 reservas simultáneas por cliente/documento.
    """
    raffle = (await db.execute(
        select(Raffle).where(Raffle.id == raffle_id, Raffle.is_public.is_(True))
    )).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    if not raffle.enable_online_purchase and not raffle.enable_manual_transfer:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "esta rifa no acepta compras online")

    # 0) Resolver seller si viene por link personal
    expected_seller_id: int | None = None
    if payload.seller_slug:
        from app.models.user import User, UserRole
        seller = (await db.execute(
            select(User).where(
                User.public_slug == payload.seller_slug,
                User.role == UserRole.SELLER,
                User.tenant_id == raffle.tenant_id,
                User.is_active.is_(True),
            )
        )).scalar_one_or_none()
        if not seller:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "el enlace del vendedor no es válido",
            )
        expected_seller_id = seller.id

    # 1) Verificar tickets
    tickets = (await db.execute(
        select(Ticket).where(
            Ticket.id.in_(payload.ticket_ids),
            Ticket.raffle_id == raffle_id,
        )
    )).scalars().all()
    if len(tickets) != len(payload.ticket_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "una o más boletas no existen")

    # Sin seller_slug → tickets deben ser del pool general (seller_id IS NULL).
    # Con seller_slug → tickets deben pertenecer a ese vendedor.
    unavailable = [
        t.number_label for t in tickets
        if not (
            t.seller_id == expected_seller_id and t.customer_id is None
            and t.status == TicketStatus.AVAILABLE
        )
    ]
    if unavailable:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"las siguientes boletas ya no están disponibles: {', '.join(unavailable[:10])}"
            + ("..." if len(unavailable) > 10 else ""),
        )

    # 2) Cliente
    customer = await _find_or_create_customer(
        db, raffle.tenant_id,
        full_name=payload.customer_name,
        email=payload.customer_email,
        phone=payload.customer_phone,
        document=payload.customer_document,
        city=payload.customer_city,
    )
    await _link_referral(db, customer, payload.referral_code)

    # Cap anti-fraud: máx N reservas activas simultáneas
    active_reservations = await db.scalar(
        select(func.count()).select_from(Reservation).where(
            Reservation.customer_id == customer.id,
            Reservation.is_active.is_(True),
        )
    ) or 0
    if active_reservations + len(tickets) > MAX_CONCURRENT_RESERVATIONS_PER_CUSTOMER:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"máximo {MAX_CONCURRENT_RESERVATIONS_PER_CUSTOMER} boletas reservadas simultáneas por cliente.",
        )

    # 3) Reservar (24h)
    # Si vino por link personal, la reserva se atribuye al vendedor
    # (para que la comisión, notificaciones y trazabilidad vayan a él).
    expires_at = await _ensure_reservations(
        db, tickets, customer.id, seller_id=expected_seller_id,
    )

    # 4) Precio total
    total_price = float(raffle.ticket_price) * len(tickets)
    amount_cents = int(total_price * 100)
    reference = _generate_reference(raffle.id, customer.id)

    # 5) Wompi checkout URL (solo si el tenant tiene Wompi configurado)
    tenant = raffle.tenant if hasattr(raffle, "tenant") else None
    if tenant is None:
        from app.models.tenant import Tenant
        tenant = (await db.execute(select(Tenant).where(Tenant.id == raffle.tenant_id))).scalar_one()

    wompi_cfg = wompi_service.tenant_wompi_config(tenant) if raffle.enable_online_purchase else None
    checkout_url = None
    if wompi_cfg and wompi_cfg.get("integrity_key"):
        origin = str(request.base_url).rstrip("/")
        # Redirect al frontend con la reference (para que la UI muestre el resultado)
        redirect_url = f"{origin.replace('/api', '')}/rifa/{raffle.id}/pago/{reference}"
        checkout_url = wompi_service.build_checkout_url(
            public_key=wompi_cfg["public_key"],
            reference=reference,
            amount_cents=amount_cents,
            currency="COP",
            integrity_key=wompi_cfg["integrity_key"],
            redirect_url=redirect_url,
            customer_email=customer.email,
        )

    # 6) Persistir la transacción
    tx = WompiTransaction(
        tenant_id=raffle.tenant_id,
        raffle_id=raffle.id,
        customer_id=customer.id,
        reference=reference,
        amount_cents=amount_cents,
        currency="COP",
        status="PENDING",
        checkout_url=checkout_url,
    )
    db.add(tx)
    await db.flush()
    for t in tickets:
        db.add(WompiTransactionTicket(transaction_id=tx.id, ticket_id=t.id))

    await log_action(
        db, actor_id=None, action="public.checkout_started",
        entity_type="wompi_transaction", entity_id=tx.id, request=request,
        metadata={
            "raffle_id": raffle.id,
            "customer_id": customer.id,
            "ticket_ids": payload.ticket_ids,
            "amount_cents": amount_cents,
        },
    )
    await db.commit()

    return CheckoutResponse(
        reference=reference,
        checkout_url=checkout_url,
        reservation_expires_at=expires_at.isoformat(),
        ticket_labels=[t.number_label for t in tickets],
        total_amount_cents=amount_cents,
    )


@router.post("/wompi/webhook", status_code=200)
async def wompi_webhook(request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    """
    Recibe eventos de Wompi (transaction.updated, principalmente).

    - Verifica firma HMAC contra el webhook_secret del tenant.
    - Idempotente: si el evento ya se procesó, retorna 200 sin hacer nada.
    - Al confirmar APPROVED → marca tickets como PAID + envía email + WhatsApp.
    """
    raw_body = await request.body()
    try:
        import json
        event = json.loads(raw_body)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "payload inválido")

    data = event.get("data", {})
    tx_data = data.get("transaction", {})
    reference = tx_data.get("reference")
    if not reference:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "sin reference")

    tx = (await db.execute(
        select(WompiTransaction).where(WompiTransaction.reference == reference)
    )).scalar_one_or_none()
    if not tx:
        # No es nuestra — respondemos 200 para que Wompi no reintente
        return {"received": True, "known": False}

    from app.models.tenant import Tenant
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tx.tenant_id))).scalar_one()

    # Verificar firma (best-effort — si no hay secret, aceptamos pero marcamos flag)
    signature = event.get("signature", {})
    checksum = signature.get("checksum")
    verified = False
    if tenant.wompi_webhook_secret and checksum:
        verified = wompi_service.verify_event_signature(
            raw_body, checksum, tenant.wompi_webhook_secret,
        )
    tx.signature_verified = verified

    # Actualiza campos base siempre
    tx.wompi_transaction_id = tx_data.get("id") or tx.wompi_transaction_id
    tx.payment_method_type = tx_data.get("payment_method_type") or tx.payment_method_type
    tx.payload_snapshot = event
    new_status = (tx_data.get("status") or "").upper() or "PENDING"

    # Idempotencia: si ya está APPROVED y el evento vuelve a llegar, no reprocesa
    if tx.status == "APPROVED" and new_status == "APPROVED":
        await db.commit()
        return {"received": True, "already_processed": True}

    tx.status = new_status

    # Si aprobó → marcar tickets como PAID + notificar
    if new_status == "APPROVED":
        tx.paid_at = datetime.now(timezone.utc)

        # Traer tickets vinculados
        ticket_ids_q = await db.execute(
            select(WompiTransactionTicket.ticket_id).where(
                WompiTransactionTicket.transaction_id == tx.id,
            )
        )
        ticket_ids = [r[0] for r in ticket_ids_q.all()]
        tickets = (await db.execute(
            select(Ticket).where(Ticket.id.in_(ticket_ids))
        )).scalars().all()
        for t in tickets:
            t.status = TicketStatus.PAID
            t.paid_amount = tx.amount_cents / 100 / len(tickets)  # split
        # Desactiva las reservas
        await db.execute(
            Reservation.__table__.update()
            .where(Reservation.ticket_id.in_(ticket_ids), Reservation.is_active.is_(True))
            .values(is_active=False, released_at=datetime.now(timezone.utc),
                    release_reason="paid")
        )

        # Notificación al cliente + threshold check
        raffle = (await db.execute(select(Raffle).where(Raffle.id == tx.raffle_id))).scalar_one()
        customer = (await db.execute(select(Customer).where(Customer.id == tx.customer_id))).scalar_one_or_none()

        if customer and customer.email:
            base = str(request.base_url).replace("/api", "").rstrip("/")
            verify_urls = [f"{base}/verify/{t.code}" for t in tickets]
            try:
                await notification_service.notify_payment_confirmed(
                    customer_email=customer.email,
                    customer_phone=customer.phone,
                    raffle_name=raffle.name,
                    ticket_labels=[t.number_label for t in tickets],
                    total_amount=tx.amount_cents / 100,
                    verify_urls=verify_urls,
                )
            except Exception:
                pass  # no fallar el webhook por notificación

        # Marca referral como PENDING si hay
        if customer:
            ref = (await db.execute(
                select(Referral).where(Referral.referred_customer_id == customer.id)
            )).scalars().first()
            if ref and ref.reward_status == "NONE":
                ref.reward_status = "PENDING"
                ref.first_purchase_at = datetime.now(timezone.utc)

        # Threshold check
        await _maybe_notify_threshold(db, raffle, request)

    await log_action(
        db, actor_id=None, action="public.wompi_webhook",
        entity_type="wompi_transaction", entity_id=tx.id, request=request,
        metadata={"status": new_status, "reference": reference, "verified": verified},
    )
    await db.commit()
    return {"received": True, "status": new_status}


async def _maybe_notify_threshold(db: AsyncSession, raffle: Raffle, request: Request) -> None:
    """Si la rifa alcanzó su threshold_pct y no se ha notificado, avisa al admin."""
    if raffle.draw_notified_at is not None:
        return
    total, paid, pct = await _raffle_sold_stats(db, raffle.id)
    if pct < raffle.draw_threshold_pct:
        return

    # Buscar admin de la rifa (primer admin del tenant)
    from app.models.user import User, UserRole
    admin = (await db.execute(
        select(User).where(User.tenant_id == raffle.tenant_id, User.role == UserRole.ADMIN)
        .limit(1)
    )).scalars().first()

    if admin and admin.email:
        try:
            await notification_service.notify_admin_threshold_reached(
                admin_email=admin.email,
                raffle_name=raffle.name,
                pct=pct,
                total_paid=paid,
                total=total,
            )
        except Exception:
            pass

    raffle.draw_notified_at = datetime.now(timezone.utc)


@router.post("/raffles/{raffle_id}/manual-transfer", status_code=201)
async def public_manual_transfer(
    raffle_id: int,
    payload: ManualTransferRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Cliente sube comprobante de transferencia manual. Reserva boletas
    hasta que el admin apruebe (o rechace)."""
    raffle = (await db.execute(
        select(Raffle).where(Raffle.id == raffle_id, Raffle.is_public.is_(True))
    )).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    if not raffle.enable_manual_transfer:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "esta rifa no acepta transferencia manual")

    tickets = (await db.execute(
        select(Ticket).where(
            Ticket.id.in_(payload.ticket_ids),
            Ticket.raffle_id == raffle_id,
        )
    )).scalars().all()
    if len(tickets) != len(payload.ticket_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "una o más boletas no existen")

    unavailable = [
        t.number_label for t in tickets
        if not (t.seller_id is None and t.customer_id is None and t.status == TicketStatus.AVAILABLE)
    ]
    if unavailable:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"boletas no disponibles: {', '.join(unavailable[:10])}",
        )

    customer = await _find_or_create_customer(
        db, raffle.tenant_id,
        full_name=payload.customer_name,
        email=payload.customer_email,
        phone=payload.customer_phone,
        document=payload.customer_document,
    )

    await _ensure_reservations(db, tickets, customer.id)

    submission = ManualTransferSubmission(
        tenant_id=raffle.tenant_id,
        raffle_id=raffle.id,
        customer_id=customer.id,
        ticket_ids=payload.ticket_ids,
        amount_declared=payload.amount_declared,
        payment_method=payload.payment_method,
        proof_url=payload.proof_url,
        reference=payload.reference,
        status="PENDING",
    )
    db.add(submission)
    await db.flush()

    await log_action(
        db, actor_id=None, action="public.manual_transfer_submitted",
        entity_type="manual_transfer_submission", entity_id=submission.id, request=request,
        metadata={
            "raffle_id": raffle.id,
            "customer_id": customer.id,
            "ticket_ids": payload.ticket_ids,
            "amount": payload.amount_declared,
        },
    )
    await db.commit()

    return {
        "submission_id": submission.id,
        "status": "PENDING",
        "message": "Tu comprobante fue recibido. Se revisará en las próximas horas y recibirás confirmación por email.",
    }


# ============================================================
# MAGIC LINK AUTH (portal cliente)
# ============================================================


@router.post("/auth/request-link")
async def request_magic_link(payload: MagicLinkRequest, request: Request,
                              db: Annotated[AsyncSession, Depends(get_db)]):
    """Envía un magic link al email del cliente. Solo funciona si el email
    ya existe en la BD (es decir, ya compró alguna vez)."""
    customer = (await db.execute(
        select(Customer).where(Customer.email == payload.email)
    )).scalars().first()

    # Nunca reveles si el email existe (evita enumeración). Siempre responde OK.
    if not customer:
        return {"sent": True, "message": "Si el email está registrado, recibirás un link de acceso."}

    # Genera token, guarda solo el hash
    plain_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(plain_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=MAGIC_LINK_TTL_MINUTES)

    auth_token = CustomerAuthToken(
        customer_id=customer.id,
        token_hash=token_hash,
        purpose="magic_link",
        expires_at=expires_at,
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:255],
    )
    db.add(auth_token)
    await db.commit()

    # Envía email con el link
    origin = str(request.base_url).replace("/api", "").rstrip("/")
    link_url = f"{origin}/mi-cuenta?t={plain_token}"
    try:
        await notification_service.send_magic_link(to_email=customer.email, link_url=link_url)
    except Exception:
        pass

    return {"sent": True, "message": "Revisa tu correo. El link expira en 15 minutos."}


@router.post("/auth/consume", response_model=CustomerSessionOut)
async def consume_magic_link(payload: MagicLinkConsumeRequest,
                               db: Annotated[AsyncSession, Depends(get_db)]):
    """Intercambia el token por la sesión del cliente. El token es de un solo uso."""
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)

    at = (await db.execute(
        select(CustomerAuthToken).where(
            CustomerAuthToken.token_hash == token_hash,
            CustomerAuthToken.expires_at > now,
            CustomerAuthToken.used_at.is_(None),
        )
    )).scalars().first()
    if not at:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "link inválido o expirado")

    at.used_at = now
    customer = (await db.execute(
        select(Customer).where(Customer.id == at.customer_id)
    )).scalar_one()

    # Primera vez: marca email_verified y genera referral_code
    if not customer.email_verified:
        customer.email_verified = True
    if not customer.referral_code:
        # Retry hasta 5 veces por colisión (muy raro con 8 chars de alphabet 32)
        for _ in range(5):
            code = _generate_referral_code()
            exists_code = await db.scalar(
                select(exists().where(Customer.referral_code == code))
            )
            if not exists_code:
                customer.referral_code = code
                break

    await db.commit()

    return CustomerSessionOut(
        id=customer.id,
        full_name=customer.full_name,
        email=customer.email,
        phone=customer.phone,
        document=customer.document,
        referral_code=customer.referral_code,
    )


@router.get("/me/tickets")
async def my_tickets_public(
    customer_id: int = Query(..., description="ID del cliente autenticado (viene de consume)"),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """Lista boletas del cliente. Cliente autentica pasando su ID
    obtenido en /auth/consume (guardado en localStorage del frontend).

    NOTA: en una v2 conviene emitir un JWT y validarlo aquí. Por ahora
    el frontend guarda el ID y el ID es opaco (auto-increment). No es
    secreto perfecto pero el atacante necesitaría adivinar el ID exacto.
    """
    from app.models.raffle import Raffle as R
    tickets_q = await db.execute(
        select(Ticket, R)
        .join(R, R.id == Ticket.raffle_id)
        .where(Ticket.customer_id == customer_id)
        .order_by(Ticket.raffle_id, Ticket.number_label)
    )
    result = []
    for ticket, raffle in tickets_q.all():
        result.append({
            "ticket_id": ticket.id,
            "raffle_id": raffle.id,
            "raffle_name": raffle.name,
            "number_label": ticket.number_label,
            "code": ticket.code,
            "status": ticket.status.value if hasattr(ticket.status, 'value') else str(ticket.status),
            "paid_amount": float(ticket.paid_amount),
        })
    return result
