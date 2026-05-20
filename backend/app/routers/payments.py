from decimal import Decimal
from pathlib import Path
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.customer import Customer
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.raffle import Raffle
from app.models.ticket import Ticket
from app.models.user import User, UserRole
from app.schemas.payment import PaymentListItem, PaymentOut, PaymentRejection
from app.services.audit_service import log_action
from app.services.payment_service import (
    confirm_payment,
    reject_payment,
    submit_payment,
)

settings = get_settings()
router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/tickets/{ticket_id}/submit", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def submit_payment_endpoint(
    ticket_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
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
    return payment


@router.get("", response_model=List[PaymentListItem])
async def list_payments(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    status_filter: Optional[PaymentStatus] = None,
):
    """Lista pagos. Admin ve todo; vendedor ve solo los pagos de sus boletas."""
    q = select(Payment).order_by(Payment.id.desc())
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


@router.post("/{payment_id}/confirm", response_model=PaymentOut)
async def confirm_payment_endpoint(
    payment_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
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
    return payment


@router.post("/{payment_id}/reject", response_model=PaymentOut)
async def reject_payment_endpoint(
    payment_id: int,
    payload: PaymentRejection,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
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
):
    """Sirve el archivo del comprobante. Vendedor solo ve los suyos."""
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id))).scalar_one_or_none()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "pago no encontrado")
    if not payment.proof_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "este pago no tiene comprobante adjunto")

    if actor.role == UserRole.SELLER and payment.seller_id != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no autorizado")

    path = Path(settings.upload_dir) / payment.proof_url
    if not path.is_file():
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
