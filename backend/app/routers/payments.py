from decimal import Decimal
from pathlib import Path
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_current_user, get_tenant_scope, require_roles
from app.models.customer import Customer
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.raffle import Raffle
from app.models.ticket import Ticket
from app.models.user import User, UserRole
from app.schemas.payment import PaymentListItem, PaymentOut, PaymentRejection
from app.models.prize import Prize
from app.models.ticket_number import TicketNumber
from app.services.audit_service import log_action
from app.services.email_service import (
    send_admin_pending_payment_email,
    send_ticket_paid_email,
)
from app.services.image_service import build_ticket_image
from app.services.payment_service import (
    confirm_payment,
    reject_payment,
    submit_payment,
)
from app.services.qr_service import build_verify_url
from app.services.storage_service import (
    is_supabase_proof_url,
    local_proof_path,
    signed_url_for_proof,
)

settings = get_settings()
router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/tickets/{ticket_id}/submit", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def submit_payment_endpoint(
    ticket_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    # Solo SELLER — reportar un pago entrante de un cliente es acción de
    # venta. Los admins gestionan los pagos ya reportados (aprobar/rechazar/
    # editar/eliminar) vía los demás endpoints de /payments, no los crean.
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    method: Annotated[PaymentMethod, Form()],
    amount: Annotated[Decimal, Form()],
    reference: Annotated[Optional[str], Form()] = None,
    notes: Annotated[Optional[str], Form()] = None,
    proof: Annotated[Optional[UploadFile], File()] = None,
):
    """Reporta un pago para una boleta reservada. Acepta multipart/form-data con un comprobante opcional."""
    # Permisos: el vendedor solo puede reportar pagos de SUS boletas
    ticket = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    # Validar tenancy de la boleta
    raffle_of_ticket = (await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))).scalar_one()
    assert_tenant_owns(scope, raffle_of_ticket.tenant_id)

    if actor.role == UserRole.SELLER and ticket.seller_id != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no puedes reportar pago de una boleta que no es tuya")

    payment = await submit_payment(
        db,
        ticket_id=ticket_id,
        actor_id=actor.id,
        method=method,
        amount=amount,
        reference=reference,
        notes=notes,
        proof_file=proof.file if proof else None,
        proof_filename=proof.filename if proof else None,
    )

    await log_action(
        db, actor_id=actor.id, action="payment.submit",
        entity_type="payment", entity_id=payment.id, request=request,
        metadata={
            "ticket_id": ticket_id,
            "method": method.value,
            "amount": float(amount),
            "proof": bool(proof),
        },
    )
    await db.commit()
    await db.refresh(payment)

    # Notificación al admin (best-effort, no falla la transacción)
    try:
        customer = (await db.execute(select(Customer).where(Customer.id == payment.customer_id))).scalar_one()
        raffle = (await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))).scalar_one()
        seller = None
        if payment.seller_id:
            seller = (await db.execute(select(User).where(User.id == payment.seller_id))).scalar_one_or_none()
        await send_admin_pending_payment_email(
            raffle_name=raffle.name,
            ticket_label=ticket.number_label,
            customer_name=customer.full_name,
            customer_phone=customer.phone,
            seller_name=seller.full_name if seller else None,
            amount=float(payment.amount),
            method=payment.method.value,
            reference=payment.reference,
        )
    except Exception:
        pass  # no romper la respuesta por un email

    return payment


@router.get("", response_model=List[PaymentListItem])
async def list_payments(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    status_filter: Optional[PaymentStatus] = None,
):
    """Lista pagos. Admin ve todo; vendedor ve solo los pagos de sus boletas."""
    q = (
        select(Payment)
        .join(Ticket, Ticket.id == Payment.ticket_id)
        .join(Raffle, Raffle.id == Ticket.raffle_id)
        .order_by(Payment.id.desc())
    )
    if scope.tenant_id is not None:
        q = q.where(Raffle.tenant_id == scope.tenant_id)
    if status_filter:
        q = q.where(Payment.status == status_filter)
    if actor.role == UserRole.SELLER:
        q = q.where(Payment.seller_id == actor.id)

    payments = (await db.execute(q.limit(200))).scalars().all()

    # Enriquecer con datos del ticket/cliente/vendedor en consulta batch
    if not payments:
        return []

    ticket_ids = list({p.ticket_id for p in payments})
    customer_ids = list({p.customer_id for p in payments})
    seller_ids = list({p.seller_id for p in payments if p.seller_id})

    tickets = {
        t.id: t
        for t in (
            await db.execute(
                select(Ticket).where(Ticket.id.in_(ticket_ids)).options(selectinload(Ticket.raffle))
            )
        ).scalars().all()
    }
    customers = {
        c.id: c
        for c in (await db.execute(select(Customer).where(Customer.id.in_(customer_ids)))).scalars().all()
    }
    sellers = (
        {
            s.id: s
            for s in (await db.execute(select(User).where(User.id.in_(seller_ids)))).scalars().all()
        }
        if seller_ids else {}
    )

    out: List[PaymentListItem] = []
    for p in payments:
        t = tickets.get(p.ticket_id)
        c = customers.get(p.customer_id)
        s = sellers.get(p.seller_id) if p.seller_id else None
        if not t or not c:
            continue
        out.append(
            PaymentListItem(
                id=p.id,
                ticket_id=p.ticket_id,
                ticket_label=t.number_label,
                ticket_code=t.code,
                ticket_status=t.status.value,
                ticket_paid_amount=t.paid_amount or 0,
                ticket_total_price=t.raffle.ticket_price if t.raffle else 0,
                raffle_name=t.raffle.name if t.raffle else "",
                customer_id=c.id,
                customer_name=c.full_name,
                customer_phone=c.phone,
                seller_id=p.seller_id,
                seller_name=s.full_name if s else None,
                method=p.method,
                amount=p.amount,
                reference=p.reference,
                proof_url=p.proof_url,
                notes=p.notes,
                status=p.status,
                rejection_reason=p.rejection_reason,
                created_at=p.created_at,
                confirmed_at=p.confirmed_at,
            )
        )
    return out


async def _verify_payment_tenancy(db: AsyncSession, payment_id: int, scope: TenantScope) -> Payment:
    p = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "pago no encontrado")
    t = (await db.execute(select(Ticket).where(Ticket.id == p.ticket_id))).scalar_one()
    r = (await db.execute(select(Raffle).where(Raffle.id == t.raffle_id))).scalar_one()
    assert_tenant_owns(scope, r.tenant_id)
    return p


@router.post("/{payment_id}/confirm", response_model=PaymentOut)
async def confirm_payment_endpoint(
    payment_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    await _verify_payment_tenancy(db, payment_id, scope)
    payment, ticket, commission = await confirm_payment(
        db, payment_id=payment_id, confirmed_by_user_id=actor.id
    )
    await log_action(
        db, actor_id=actor.id, action="payment.confirm",
        entity_type="payment", entity_id=payment.id, request=request,
        metadata={
            "ticket_id": ticket.id,
            "commission_id": commission.id if commission else None,
            "commission_amount": float(commission.amount) if commission else None,
        },
    )
    await db.commit()
    await db.refresh(payment)

    # Email al cliente con la boleta (best-effort)
    try:
        customer = (await db.execute(select(Customer).where(Customer.id == payment.customer_id))).scalar_one()
        if customer.email:
            raffle = (
                await db.execute(
                    select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == ticket.raffle_id)
                )
            ).scalar_one()
            # Cargar números ordenados
            tn_rows = (
                await db.execute(
                    select(TicketNumber).where(TicketNumber.ticket_id == ticket.id).order_by(TicketNumber.position)
                )
            ).scalars().all()
            numbers_ordered = [n.number for n in tn_rows]

            prizes = [{"name": p.name, "draw_date": p.draw_date.isoformat()} for p in raffle.prizes]
            verify_url = f"{settings.frontend_url}/verify/{ticket.code}"

            # Generar imagen de boleta para adjuntar
            image_png = None
            try:
                image_png = build_ticket_image(
                    raffle_name=raffle.name,
                    ticket_label=ticket.number_label,
                    ticket_code=ticket.code,
                    numbers=numbers_ordered,
                    prizes=prizes,
                    customer_name=customer.full_name,
                    is_paid=True,
                    primary_color=raffle.primary_color,
                    lottery_name=raffle.lottery_name,
                    responsible_name=raffle.responsible_name,
                    responsible_phone=raffle.responsible_phone,
                    final_draw_date=raffle.final_draw_date.isoformat(),
                )
            except Exception:
                pass  # adjuntar imagen es opcional

            await send_ticket_paid_email(
                to_email=customer.email,
                customer_name=customer.full_name,
                raffle_name=raffle.name,
                ticket_label=ticket.number_label,
                ticket_code=ticket.code,
                numbers=sorted(numbers_ordered),
                prizes=prizes,
                final_draw_date=raffle.final_draw_date.isoformat(),
                lottery_name=raffle.lottery_name,
                responsible_name=raffle.responsible_name,
                responsible_phone=raffle.responsible_phone,
                verify_url=verify_url,
                image_png=image_png,
            )
    except Exception:
        pass

    return payment


@router.post("/{payment_id}/reject", response_model=PaymentOut)
async def reject_payment_endpoint(
    payment_id: int,
    payload: PaymentRejection,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    await _verify_payment_tenancy(db, payment_id, scope)
    payment, ticket = await reject_payment(
        db, payment_id=payment_id, rejected_by_user_id=actor.id, reason=payload.reason,
    )
    await log_action(
        db, actor_id=actor.id, action="payment.reject",
        entity_type="payment", entity_id=payment.id, request=request,
        metadata={"ticket_id": ticket.id, "reason": payload.reason},
    )
    await db.commit()
    await db.refresh(payment)
    return payment


@router.get("/{payment_id}/proof")
async def get_proof(
    payment_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(get_current_user)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Sirve el archivo del comprobante. Vendedor solo ve los suyos."""
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "pago no encontrado")
    await _verify_payment_tenancy(db, payment_id, scope)
    if not payment.proof_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "este pago no tiene comprobante adjunto")

    if actor.role == UserRole.SELLER and payment.seller_id != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no autorizado")

    # Supabase Storage: redirige a URL firmada temporal (1h).
    if is_supabase_proof_url(payment.proof_url):
        signed = signed_url_for_proof(payment.proof_url, expires_in=3600)
        if not signed:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "no se pudo generar URL firmada del comprobante",
            )
        return RedirectResponse(url=signed, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # Archivo local (legacy)
    path = local_proof_path(payment.proof_url)
    if not path or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "archivo de comprobante no encontrado en disco")

    ext = path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".pdf": "application/pdf",
    }
    return FileResponse(
        path=str(path),
        media_type=media_types.get(ext, "application/octet-stream"),
        filename=f"comprobante-pago-{payment_id}{ext}",
    )
