"""
Endpoints ADMIN para venta pública:
  - Configurar Wompi del tenant (llaves + entorno)
  - Toggle público/privado por rifa
  - Programar fecha del sorteo (con notificación a clientes)
  - Revisar transferencias manuales pendientes (aprobar/rechazar)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_tenant_scope, require_roles
from app.models.customer import Customer
from app.models.public_sales import ManualTransferSubmission, WompiTransactionTicket
from app.models.raffle import Raffle
from app.models.reservation import Reservation
from app.models.tenant import Tenant
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User, UserRole
from app.services import notification_service
from app.services.audit_service import log_action
from app.services.crypto_service import encrypt

router = APIRouter(prefix="/admin/public-sales", tags=["admin-public-sales"])


# ============================================================
# SCHEMAS
# ============================================================


class WompiConfigRequest(BaseModel):
    public_key: str = Field(min_length=10)
    private_key: str = Field(min_length=10)
    webhook_secret: str
    integrity_key: str
    env: str = Field(pattern="^(sandbox|production)$")


class WompiConfigOut(BaseModel):
    public_key: str
    env: str
    private_key_configured: bool
    webhook_secret_configured: bool
    integrity_key_configured: bool


class RafflePublicConfigRequest(BaseModel):
    is_public: bool | None = None
    enable_online_purchase: bool | None = None
    enable_manual_transfer: bool | None = None
    draw_threshold_pct: int | None = Field(default=None, ge=1, le=100)
    public_welcome_message: str | None = None


class ScheduleDrawRequest(BaseModel):
    """Confirmar fecha del sorteo (activa notificación a clientes)."""
    confirmed_date: str  # ISO date


class ManualTransferReviewRequest(BaseModel):
    approve: bool
    notes: str | None = None


# ============================================================
# CONFIG WOMPI (tenant-level)
# ============================================================


@router.get("/wompi-config", response_model=WompiConfigOut)
async def get_wompi_config(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Ver estado de la configuración Wompi del tenant. NUNCA devuelve
    llaves privadas — solo public_key + flags de "está configurado"."""
    if scope.tenant_id is None:
        raise HTTPException(400, "super_admin necesita seleccionar tenant")
    tenant = (await db.execute(select(Tenant).where(Tenant.id == scope.tenant_id))).scalar_one()
    return WompiConfigOut(
        public_key=tenant.wompi_public_key or "",
        env=tenant.wompi_env or "sandbox",
        private_key_configured=bool(tenant.wompi_private_key_enc),
        webhook_secret_configured=bool(tenant.wompi_webhook_secret),
        integrity_key_configured=bool(tenant.wompi_integrity_key),
    )


@router.put("/wompi-config", response_model=WompiConfigOut)
async def update_wompi_config(
    payload: WompiConfigRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Configura las llaves Wompi del tenant. La private_key se guarda
    CIFRADA (Fernet). Requiere CRYPTO_KEY seteada en env."""
    if scope.tenant_id is None:
        raise HTTPException(400, "super_admin necesita seleccionar tenant")
    tenant = (await db.execute(select(Tenant).where(Tenant.id == scope.tenant_id))).scalar_one()

    tenant.wompi_public_key = payload.public_key
    tenant.wompi_private_key_enc = encrypt(payload.private_key)
    tenant.wompi_webhook_secret = payload.webhook_secret
    tenant.wompi_integrity_key = payload.integrity_key
    tenant.wompi_env = payload.env

    await log_action(
        db, actor_id=actor.id, action="tenant.wompi_config_updated",
        entity_type="tenant", entity_id=tenant.id, request=request,
        metadata={"env": payload.env, "public_key_prefix": payload.public_key[:20]},
    )
    await db.commit()

    return WompiConfigOut(
        public_key=tenant.wompi_public_key,
        env=tenant.wompi_env,
        private_key_configured=True,
        webhook_secret_configured=True,
        integrity_key_configured=True,
    )


# ============================================================
# TOGGLE PÚBLICO / PRIVADO POR RIFA
# ============================================================


@router.patch("/raffles/{raffle_id}/public-config")
async def update_raffle_public_config(
    raffle_id: int,
    payload: RafflePublicConfigRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Actualiza los flags de venta pública de una rifa. Cualquiera puede
    quedar None para no tocar (solo se cambia lo que se envía)."""
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(404, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    updated = {}
    for field in ("is_public", "enable_online_purchase", "enable_manual_transfer",
                  "draw_threshold_pct", "public_welcome_message"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(raffle, field, val)
            updated[field] = val

    # Validación: online_purchase requiere Wompi configurado
    if payload.enable_online_purchase:
        tenant = (await db.execute(select(Tenant).where(Tenant.id == raffle.tenant_id))).scalar_one()
        if not (tenant.wompi_public_key and tenant.wompi_private_key_enc):
            raise HTTPException(
                400, "no puedes activar pago Wompi sin configurar las llaves del tenant primero.",
            )

    await log_action(
        db, actor_id=actor.id, action="raffle.public_config_updated",
        entity_type="raffle", entity_id=raffle.id, request=request,
        metadata=updated,
    )
    await db.commit()
    return {"updated": updated}


# ============================================================
# SCHEDULE DRAW DATE
# ============================================================


@router.post("/raffles/{raffle_id}/schedule-draw")
async def schedule_draw_date(
    raffle_id: int,
    payload: ScheduleDrawRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Admin confirma la fecha del sorteo. Notifica a todos los clientes
    que compraron (email + WhatsApp)."""
    from datetime import date as date_cls

    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(404, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    try:
        new_date = date_cls.fromisoformat(payload.confirmed_date)
    except ValueError:
        raise HTTPException(400, "fecha inválida (usa formato YYYY-MM-DD)")

    raffle.final_draw_date = new_date
    raffle.draw_date_scheduled = True

    # Notifica a todos los clientes que compraron
    customer_ids_q = await db.execute(
        select(Ticket.customer_id).where(
            Ticket.raffle_id == raffle.id,
            Ticket.customer_id.is_not(None),
            Ticket.status.in_([TicketStatus.PAID, TicketStatus.WINNING,
                               TicketStatus.RESERVED, TicketStatus.PARTIALLY_PAID]),
        ).distinct()
    )
    customer_ids = [r[0] for r in customer_ids_q.all() if r[0]]

    customers = (await db.execute(
        select(Customer).where(Customer.id.in_(customer_ids))
    )).scalars().all() if customer_ids else []

    notified = 0
    for c in customers:
        if not c.email:
            continue
        try:
            html = f"""
            <div style="font-family: system-ui, sans-serif; color: #1a2942; padding: 24px;">
              <h1 style="color: #1ec77b;">📅 Fecha confirmada del sorteo</h1>
              <p>La rifa <strong>{raffle.name}</strong> ya tiene fecha oficial:</p>
              <p style="font-size: 24px; font-weight: 700;">{new_date.strftime('%d de %B de %Y')}</p>
              <p>Prepara la buena vibra y guarda esta fecha. Te avisaremos cuando tengamos los resultados.</p>
            </div>
            """
            await notification_service.send_email(
                to=c.email,
                subject=f"📅 Fecha del sorteo confirmada — {raffle.name}",
                html_body=html,
            )
            if c.phone:
                await notification_service.send_whatsapp(
                    to=c.phone,
                    body=(
                        f"📅 Sorteo confirmado\n"
                        f"Rifa: {raffle.name}\n"
                        f"Fecha: {new_date.strftime('%d/%m/%Y')}\n\n"
                        f"¡Gracias por participar!"
                    ),
                )
            notified += 1
        except Exception:
            continue

    await log_action(
        db, actor_id=actor.id, action="raffle.draw_scheduled",
        entity_type="raffle", entity_id=raffle.id, request=request,
        metadata={"confirmed_date": payload.confirmed_date, "notified": notified},
    )
    await db.commit()
    return {"scheduled": True, "date": payload.confirmed_date, "customers_notified": notified}


# ============================================================
# REVISIÓN DE TRANSFERENCIAS MANUALES
# ============================================================


@router.get("/manual-transfers")
async def list_manual_transfers(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    status_filter: str = "PENDING",
):
    """Lista transferencias manuales pendientes de revisión (o filtradas)."""
    q = (
        select(ManualTransferSubmission, Customer, Raffle)
        .join(Customer, Customer.id == ManualTransferSubmission.customer_id, isouter=True)
        .join(Raffle, Raffle.id == ManualTransferSubmission.raffle_id)
        .where(ManualTransferSubmission.status == status_filter.upper())
        .order_by(ManualTransferSubmission.submitted_at.desc())
    )
    if scope.tenant_id is not None:
        q = q.where(ManualTransferSubmission.tenant_id == scope.tenant_id)

    rows = (await db.execute(q)).all()
    return [
        {
            "id": s.id,
            "raffle_name": r.name,
            "raffle_id": r.id,
            "customer_name": (c.full_name if c else None),
            "customer_phone": (c.phone if c else None),
            "customer_email": (c.email if c else None),
            "ticket_ids": s.ticket_ids,
            "amount_declared": float(s.amount_declared),
            "payment_method": s.payment_method,
            "proof_url": s.proof_url,
            "reference": s.reference,
            "status": s.status,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        }
        for s, c, r in rows
    ]


@router.post("/manual-transfers/{submission_id}/review")
async def review_manual_transfer(
    submission_id: int,
    payload: ManualTransferReviewRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Admin aprueba o rechaza una transferencia manual.
    - APPROVE → tickets pasan a PAID, envía email de confirmación
    - REJECT  → libera las reservas, envía email de rechazo
    """
    submission = (await db.execute(
        select(ManualTransferSubmission).where(ManualTransferSubmission.id == submission_id)
    )).scalar_one_or_none()
    if not submission:
        raise HTTPException(404, "submission no encontrada")
    if scope.tenant_id is not None and submission.tenant_id != scope.tenant_id:
        raise HTTPException(404, "submission no encontrada")

    if submission.status != "PENDING":
        raise HTTPException(400, f"submission ya fue revisada (status={submission.status})")

    submission.reviewed_by_user_id = actor.id
    submission.reviewer_notes = payload.notes
    submission.reviewed_at = datetime.now(timezone.utc)

    tickets = (await db.execute(
        select(Ticket).where(Ticket.id.in_(submission.ticket_ids))
    )).scalars().all()
    raffle = (await db.execute(select(Raffle).where(Raffle.id == submission.raffle_id))).scalar_one()
    customer = (await db.execute(select(Customer).where(Customer.id == submission.customer_id))).scalar_one_or_none()

    if payload.approve:
        submission.status = "APPROVED"
        per_ticket = float(submission.amount_declared) / len(tickets) if tickets else 0
        for t in tickets:
            t.status = TicketStatus.PAID
            t.paid_amount = per_ticket
        await db.execute(
            Reservation.__table__.update()
            .where(Reservation.ticket_id.in_(submission.ticket_ids),
                   Reservation.is_active.is_(True))
            .values(is_active=False, released_at=datetime.now(timezone.utc),
                    release_reason="manual_approved")
        )

        if customer and customer.email:
            base = str(request.base_url).replace("/api", "").rstrip("/")
            verify_urls = [f"{base}/verify/{t.code}" for t in tickets]
            try:
                await notification_service.notify_payment_confirmed(
                    customer_email=customer.email,
                    customer_phone=customer.phone,
                    raffle_name=raffle.name,
                    ticket_labels=[t.number_label for t in tickets],
                    total_amount=float(submission.amount_declared),
                    verify_urls=verify_urls,
                )
            except Exception:
                pass

        # Threshold check post-approval
        from app.routers.public_sales import _maybe_notify_threshold
        await _maybe_notify_threshold(db, raffle, request)

    else:
        submission.status = "REJECTED"
        # Libera las reservas para que las boletas vuelvan a pool público
        for t in tickets:
            if t.status == TicketStatus.RESERVED:
                t.status = TicketStatus.AVAILABLE
                t.customer_id = None
        await db.execute(
            Reservation.__table__.update()
            .where(Reservation.ticket_id.in_(submission.ticket_ids),
                   Reservation.is_active.is_(True))
            .values(is_active=False, released_at=datetime.now(timezone.utc),
                    release_reason="manual_rejected")
        )

        if customer and customer.email:
            try:
                html = f"""
                <div style="font-family: system-ui, sans-serif; color: #1a2942; padding: 24px;">
                  <h1 style="color: #ef4444;">Transferencia no aprobada</h1>
                  <p>Tu comprobante para la rifa <strong>{raffle.name}</strong> no fue aprobado.</p>
                  <p><strong>Motivo:</strong> {payload.notes or 'Sin comentarios adicionales.'}</p>
                  <p>Puedes intentar de nuevo si estas boletas siguen disponibles.</p>
                </div>
                """
                await notification_service.send_email(
                    to=customer.email,
                    subject=f"Transferencia rechazada — {raffle.name}",
                    html_body=html,
                )
            except Exception:
                pass

    await log_action(
        db, actor_id=actor.id, action="manual_transfer.reviewed",
        entity_type="manual_transfer_submission", entity_id=submission.id, request=request,
        metadata={"approved": payload.approve, "notes": payload.notes},
    )
    await db.commit()
    return {"submission_id": submission.id, "status": submission.status}
