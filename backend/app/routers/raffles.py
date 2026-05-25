from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_tenant_scope, require_roles
from app.core.exceptions import ImmutableRaffleError
from app.models.customer import Customer
from app.models.prize import Prize
from app.models.raffle import Raffle, RaffleStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User, UserRole
from app.schemas.raffle import (
    PrizeCreate, PrizeOut, PrizeUpdate,
    RaffleCancel, RaffleCreate, RaffleOut, RafflePostpone, RaffleUpdate,
)
from app.services.audit_service import log_action
from app.services.email_service import (
    send_raffle_cancelled_email,
    send_raffle_postponed_email,
)
from app.services.number_generator import generate_raffle_numbers

router = APIRouter(prefix="/raffles", tags=["raffles"])


@router.get("", response_model=List[RaffleOut])
async def list_raffles(
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    q = select(Raffle).options(selectinload(Raffle.prizes)).order_by(Raffle.id.desc())
    if scope.tenant_id is not None:
        q = q.where(Raffle.tenant_id == scope.tenant_id)
    res = await db.execute(q)
    return res.scalars().all()


@router.post("", response_model=RaffleOut, status_code=status.HTTP_201_CREATED)
async def create_raffle(
    payload: RaffleCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    # Super admin no crea rifas: solo administra cuentas. Las rifas las crea
    # el admin del tenant correspondiente.
    target_tenant_id = scope.tenant_id  # admin del tenant propio
    if target_tenant_id is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "el super_admin no crea rifas; inicia sesión como admin de una cuenta.",
        )

    # Cupo: la cuenta no puede exceder su max_raffles.
    from app.models.tenant import Tenant as _Tenant
    target_tenant = (
        await db.execute(select(_Tenant).where(_Tenant.id == target_tenant_id))
    ).scalar_one_or_none()
    if not target_tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "cuenta no encontrada")
    from sqlalchemy import func as _func
    raffles_used = (
        await db.execute(
            select(_func.count(Raffle.id)).where(Raffle.tenant_id == target_tenant_id)
        )
    ).scalar_one()
    if int(raffles_used or 0) >= target_tenant.max_raffles:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            (
                f"la cuenta '{target_tenant.name}' ya alcanzó su cupo de "
                f"{target_tenant.max_raffles} rifa(s). Contacta a Boletera para ampliarlo."
            ),
        )

    tiers_data = (
        [t.model_dump(mode="json") for t in payload.commission_tiers]
        if payload.commission_tiers
        else None
    )
    package_opts_data = (
        [o.model_dump(mode="json") for o in payload.package_options]
        if payload.package_options
        else None
    )

    raffle = Raffle(
        tenant_id=target_tenant_id,
        name=payload.name,
        description=payload.description,
        mode=payload.mode.value,
        package_options=package_opts_data,
        min_package_size=payload.min_package_size,
        total_tickets=payload.total_tickets,
        numbers_per_ticket=payload.numbers_per_ticket,
        number_min=payload.number_min,
        number_max=payload.number_max,
        number_digits=payload.number_digits,
        ticket_price=payload.ticket_price,
        seller_commission=payload.seller_commission,
        commission_tiers=tiers_data,
        min_paid_threshold=payload.min_paid_threshold,
        final_draw_date=payload.final_draw_date,
        logo_url=payload.logo_url,
        primary_color=payload.primary_color,
        lottery_name=payload.lottery_name,
        responsible_name=payload.responsible_name,
        responsible_phone=payload.responsible_phone,
        responsible_email=payload.responsible_email,
        terms=payload.terms,
    )
    db.add(raffle)
    await db.flush()

    for p in payload.prizes:
        db.add(Prize(raffle_id=raffle.id, **p.model_dump()))

    await log_action(
        db, actor_id=actor.id, action="raffle.create",
        entity_type="raffle", entity_id=raffle.id,
        description=f"rifa creada: {raffle.name}", request=request,
    )
    await db.commit()
    await db.refresh(raffle, attribute_names=["prizes"])
    return raffle


@router.get("/{raffle_id}", response_model=RaffleOut)
async def get_raffle(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    res = await db.execute(
        select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == raffle_id)
    )
    raffle = res.scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)
    return raffle


@router.patch("/{raffle_id}", response_model=RaffleOut)
async def update_raffle(
    raffle_id: int,
    payload: RaffleUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    # Tras generar números, sólo permitimos cambiar campos cosméticos.
    if raffle.numbers_generated:
        forbidden = {"final_draw_date"}
        for k in forbidden:
            if getattr(payload, k) is not None:
                raise ImmutableRaffleError(f"no se puede modificar '{k}' tras generar números")

    # commission_tiers se serializa explícitamente con mode='json' para que
    # Decimal/Date se conviertan a primitivos JSON serializables (la columna
    # commission_tiers es JSONB).
    data = payload.model_dump(exclude_unset=True, mode="json")
    for field, value in data.items():
        setattr(raffle, field, value)

    await log_action(
        db, actor_id=actor.id, action="raffle.update",
        entity_type="raffle", entity_id=raffle.id, request=request,
        metadata=payload.model_dump(exclude_unset=True),
    )
    await db.commit()
    await db.refresh(raffle, attribute_names=["prizes"])
    return raffle


@router.post("/{raffle_id}/generate-numbers", response_model=RaffleOut)
async def generate_numbers(
    raffle_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    # Verifica tenancy antes de generar
    existing = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, existing.tenant_id)

    raffle = await generate_raffle_numbers(db, raffle_id)
    await log_action(
        db, actor_id=actor.id, action="raffle.generate_numbers",
        entity_type="raffle", entity_id=raffle.id, request=request,
        description="generación inmutable de números",
        metadata={"seed_hash": raffle.numbers_seed},
    )
    await db.commit()
    await db.refresh(raffle, attribute_names=["prizes"])
    return raffle


@router.post("/{raffle_id}/prizes", response_model=PrizeOut, status_code=status.HTTP_201_CREATED)
async def add_prize(
    raffle_id: int,
    payload: PrizeCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)
    prize = Prize(raffle_id=raffle.id, **payload.model_dump())
    db.add(prize)
    await log_action(
        db, actor_id=actor.id, action="prize.create",
        entity_type="prize", entity_id=None, request=request,
        metadata=payload.model_dump(mode="json"),
    )
    await db.commit()
    await db.refresh(prize)
    return prize


@router.patch("/{raffle_id}/prizes/{prize_id}", response_model=PrizeOut)
async def update_prize(
    raffle_id: int,
    prize_id: int,
    payload: PrizeUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    prize = (
        await db.execute(select(Prize).where(Prize.id == prize_id, Prize.raffle_id == raffle_id))
    ).scalar_one_or_none()
    if not prize:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "premio no encontrado")

    # No permitir cambios estructurales si ya tiene ganador registrado.
    if prize.winning_number:
        forbidden = {"position", "name", "draw_date"}
        offending = [k for k in forbidden if getattr(payload, k) is not None]
        if offending:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"este premio ya tiene ganador; no se puede modificar: {', '.join(offending)}",
            )

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(prize, field, value)

    await log_action(
        db, actor_id=actor.id, action="prize.update",
        entity_type="prize", entity_id=prize.id, request=request,
        metadata=payload.model_dump(exclude_unset=True, mode="json"),
    )
    await db.commit()
    await db.refresh(prize)
    return prize


@router.delete("/{raffle_id}/prizes/{prize_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prize(
    raffle_id: int,
    prize_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    prize = (
        await db.execute(select(Prize).where(Prize.id == prize_id, Prize.raffle_id == raffle_id))
    ).scalar_one_or_none()
    if not prize:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "premio no encontrado")
    if prize.winning_number:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "no se puede eliminar un premio que ya tiene ganador"
        )

    await log_action(
        db, actor_id=actor.id, action="prize.delete",
        entity_type="prize", entity_id=prize.id, request=request,
        metadata={"name": prize.name, "position": prize.position},
    )
    await db.delete(prize)
    await db.commit()


# ============ Aplazar / cancelar rifa ============


async def _customers_with_paid_tickets(
    db: AsyncSession, raffle_id: int,
) -> list[tuple[Customer, Ticket]]:
    """Devuelve [(customer, ticket)] de cada boleta PAID/WINNING en la rifa
    cuyo customer tenga email. Útil para envíos masivos no spam."""
    rows = (
        await db.execute(
            select(Customer, Ticket)
            .join(Ticket, Ticket.customer_id == Customer.id)
            .where(
                Ticket.raffle_id == raffle_id,
                Ticket.status.in_([TicketStatus.PAID, TicketStatus.WINNING]),
                Customer.email.is_not(None),
                Customer.email != "",
            )
        )
    ).all()
    return [(c, t) for c, t in rows]


@router.post("/{raffle_id}/postpone", response_model=RaffleOut)
async def postpone_raffle(
    raffle_id: int,
    payload: RafflePostpone,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Aplaza la rifa: mueve la fecha del sorteo final y opcionalmente
    las fechas de los premios pendientes. Envía un email empático a cada
    cliente con boleta pagada (best-effort, no falla la operación)."""
    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == raffle_id)
        )
    ).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    if raffle.status == RaffleStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "no se puede aplazar una rifa cancelada")

    if payload.new_final_draw_date <= raffle.final_draw_date:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "la nueva fecha debe ser posterior a la actual.",
        )

    old_date = raffle.final_draw_date.isoformat()
    raffle.final_draw_date = payload.new_final_draw_date

    # Aplazar premios sin ganador a sus nuevas fechas (si se enviaron)
    if payload.prize_dates:
        prize_by_id = {p.id: p for p in raffle.prizes}
        for item in payload.prize_dates:
            pid = int(item.get("prize_id"))
            new_d = item.get("new_draw_date")
            prize = prize_by_id.get(pid)
            if not prize or prize.winning_number:
                continue
            try:
                from datetime import date as _date
                prize.draw_date = _date.fromisoformat(new_d) if isinstance(new_d, str) else new_d
            except (TypeError, ValueError):
                continue

    await log_action(
        db, actor_id=actor.id, action="raffle.postpone",
        entity_type="raffle", entity_id=raffle.id, request=request,
        metadata={
            "old_date": old_date,
            "new_date": payload.new_final_draw_date.isoformat(),
            "reason": payload.reason,
        },
    )
    await db.commit()
    await db.refresh(raffle, attribute_names=["prizes"])

    # Notificaciones (best-effort)
    try:
        for customer, _ticket in await _customers_with_paid_tickets(db, raffle.id):
            await send_raffle_postponed_email(
                to_email=customer.email or "",
                customer_name=customer.full_name,
                raffle_name=raffle.name,
                new_date=raffle.final_draw_date.isoformat(),
                old_date=old_date,
                reason=payload.reason,
                responsible_name=raffle.responsible_name,
                responsible_phone=raffle.responsible_phone,
            )
    except Exception:
        pass

    return raffle


@router.post("/{raffle_id}/cancel", response_model=RaffleOut)
async def cancel_raffle(
    raffle_id: int,
    payload: RaffleCancel,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Cancela la rifa definitivamente: status=CANCELLED. Envía un email
    empático a cada cliente con boleta pagada explicando la situación y el
    proceso de reembolso. La data se conserva (auditoría/transparencia)."""
    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == raffle_id)
        )
    ).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    if raffle.status == RaffleStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "la rifa ya estaba cancelada")
    if raffle.status == RaffleStatus.FINISHED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "no se puede cancelar una rifa que ya terminó. Si necesitas anular un sorteo, contacta soporte.",
        )

    raffle.status = RaffleStatus.CANCELLED

    await log_action(
        db, actor_id=actor.id, action="raffle.cancel",
        entity_type="raffle", entity_id=raffle.id, request=request,
        description=f"rifa cancelada: {raffle.name}",
        metadata={
            "reason": payload.reason,
            "refund_contact": payload.refund_contact,
        },
    )
    await db.commit()
    await db.refresh(raffle, attribute_names=["prizes"])

    # Notificaciones (best-effort)
    try:
        for customer, ticket in await _customers_with_paid_tickets(db, raffle.id):
            await send_raffle_cancelled_email(
                to_email=customer.email or "",
                customer_name=customer.full_name,
                raffle_name=raffle.name,
                ticket_label=ticket.number_label,
                ticket_code=ticket.code,
                reason=payload.reason,
                refund_contact=payload.refund_contact,
                refund_message=payload.refund_message,
                responsible_name=raffle.responsible_name,
                responsible_phone=raffle.responsible_phone,
            )
    except Exception:
        pass

    return raffle
