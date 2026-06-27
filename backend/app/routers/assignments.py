"""Asignación de bloques de boletas a vendedores."""

from typing import Annotated, List

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_tenant_scope, require_roles
from app.models.raffle import Raffle
from app.models.reservation import Reservation
from app.models.seller_assignment import SellerAssignment
from app.models.ticket import Ticket, TicketStatus
from app.models.user import User, UserRole
from app.schemas.user import SellerAssignmentCreate, SellerAssignmentOut
from app.services.audit_service import log_action

router = APIRouter(prefix="/assignments", tags=["assignments"])


# ---------- Schemas locales del módulo ----------

class UnassignRequest(BaseModel):
    """Quita boletas específicas (por id) o N boletas del final del rango.

    Solo se pueden quitar boletas con `status='available'` que no tengan
    reserva activa ni cliente. Cualquier otra (reserved, paid, etc.) hace
    fallar la operación con detalle de cuáles bloquearon.
    """
    ticket_ids: list[int] | None = None
    quantity: int | None = Field(default=None, ge=1)


class AssignMoreRequest(BaseModel):
    quantity: int = Field(ge=1, le=10000)


class AssignmentTicketDTO(BaseModel):
    id: int
    number_label: str
    code: str
    status: str
    has_customer: bool
    paid_amount: float


class RaffleAssignmentDTO(BaseModel):
    raffle_id: int
    raffle_name: str
    raffle_status: str
    final_draw_date: str
    total_tickets: int
    assigned_count: int
    removable_count: int           # cuántas se pueden quitar (available sin reserva)
    available_pool: int            # boletas disponibles en la rifa para asignar
    tickets: list[AssignmentTicketDTO]


@router.get("", response_model=List[SellerAssignmentOut])
async def list_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    raffle_id: int | None = None,
    seller_id: int | None = None,
):
    q = (
        select(SellerAssignment)
        .join(Raffle, Raffle.id == SellerAssignment.raffle_id)
        .order_by(SellerAssignment.id.desc())
    )
    if scope.tenant_id is not None:
        q = q.where(Raffle.tenant_id == scope.tenant_id)
    if raffle_id is not None:
        q = q.where(SellerAssignment.raffle_id == raffle_id)
    if seller_id is not None:
        q = q.where(SellerAssignment.seller_id == seller_id)
    elif actor.role == UserRole.SELLER:
        # un vendedor solo ve las suyas
        q = q.where(SellerAssignment.seller_id == actor.id)
    return (await db.execute(q)).scalars().all()


@router.post("", response_model=SellerAssignmentOut, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: SellerAssignmentCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == payload.raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)
    if not raffle.numbers_generated:
        raise HTTPException(status.HTTP_409_CONFLICT, "primero genera los números de la rifa")

    seller = (await db.execute(select(User).where(User.id == payload.seller_id, User.role == UserRole.SELLER))).scalar_one_or_none()
    if not seller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "vendedor no encontrado")
    # Seller debe pertenecer al mismo tenant de la rifa
    if seller.tenant_id != raffle.tenant_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "el vendedor no pertenece a la misma cuenta que la rifa.",
        )

    # Determinar el siguiente bloque libre: tomamos el mayor to_ticket asignado y arrancamos desde ahí + 1.
    max_assigned = (
        await db.execute(
            select(func.coalesce(func.max(SellerAssignment.to_ticket), 0)).where(
                SellerAssignment.raffle_id == raffle.id
            )
        )
    ).scalar_one()
    from_ticket = int(max_assigned) + 1
    to_ticket = from_ticket + payload.quantity - 1
    if to_ticket > raffle.total_tickets:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"sin boletas disponibles: solo quedan {raffle.total_tickets - max_assigned}",
        )

    assignment = SellerAssignment(
        raffle_id=raffle.id,
        seller_id=seller.id,
        from_ticket=from_ticket,
        to_ticket=to_ticket,
        status="active",
    )
    db.add(assignment)
    await db.flush()

    # Marcar boletas con seller_id.
    # IMPORTANTE: el width del label depende del total de boletas de la rifa
    # (ver services/number_generator.py:label_width). Hardcodear zfill(3)
    # rompe en rifas con 1000+ boletas (labels de 4 dígitos como '0715'):
    # los labels generados '715','716',... no matchean con '0715','0716'...
    # de la BD, la query devuelve 0 tickets, ningún seller_id se setea →
    # el seller_assignment queda registrado pero los tickets reales no se
    # vinculan al vendedor (bug visible en el grid del admin que pinta el
    # color "asignada" cuando ticket.seller_id existe).
    label_width = max(3, len(str(raffle.total_tickets)))
    labels = [str(i).zfill(label_width) for i in range(from_ticket, to_ticket + 1)]
    tickets = (
        await db.execute(
            select(Ticket).where(Ticket.raffle_id == raffle.id, Ticket.number_label.in_(labels))
        )
    ).scalars().all()
    for t in tickets:
        if t.seller_id is None:
            t.seller_id = seller.id

    await log_action(
        db, actor_id=actor.id, action="assignment.create",
        entity_type="assignment", entity_id=assignment.id, request=request,
        metadata={
            "seller_id": seller.id, "raffle_id": raffle.id,
            "from_ticket": from_ticket, "to_ticket": to_ticket,
        },
    )
    await db.commit()
    await db.refresh(assignment)
    return assignment


# ============ Detalle de vendedor: rifas + boletas asignadas ============


@router.get(
    "/seller/{seller_id}/detail",
    response_model=list[RaffleAssignmentDTO],
)
async def seller_detail(
    seller_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Devuelve, agrupado por rifa, todas las boletas que un vendedor tiene
    actualmente asignadas (Ticket.seller_id = X). Incluye estado por boleta
    y cuántas se pueden quitar de forma segura."""
    seller = (
        await db.execute(select(User).where(User.id == seller_id, User.role == UserRole.SELLER))
    ).scalar_one_or_none()
    if not seller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "vendedor no encontrado")
    if scope.tenant_id is not None and seller.tenant_id != scope.tenant_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "este vendedor no pertenece a tu cuenta")

    # Todas las boletas del vendedor (puede atravesar varias rifas)
    tickets = (
        await db.execute(
            select(Ticket)
            .where(Ticket.seller_id == seller_id)
            .order_by(Ticket.raffle_id, Ticket.number_label)
        )
    ).scalars().all()

    if not tickets:
        return []

    # Agrupar por raffle_id
    raffle_ids = sorted({t.raffle_id for t in tickets})
    raffles_map = {
        r.id: r
        for r in (
            await db.execute(
                select(Raffle).where(Raffle.id.in_(raffle_ids))
            )
        ).scalars().all()
    }

    # Pool de disponibles por rifa (boletas sin vendedor, status available)
    pool_rows = (
        await db.execute(
            select(Ticket.raffle_id, func.count(Ticket.id))
            .where(
                Ticket.raffle_id.in_(raffle_ids),
                Ticket.seller_id.is_(None),
                Ticket.status == TicketStatus.AVAILABLE,
            )
            .group_by(Ticket.raffle_id)
        )
    ).all()
    pool_map = {rid: int(c) for rid, c in pool_rows}

    # Reservas activas por ticket — para decidir si se puede quitar
    ticket_ids = [t.id for t in tickets]
    active_res_ids = set(
        (
            await db.execute(
                select(Reservation.ticket_id).where(
                    Reservation.ticket_id.in_(ticket_ids),
                    Reservation.is_active.is_(True),
                )
            )
        ).scalars().all()
    )

    by_raffle: dict[int, list[Ticket]] = {}
    for t in tickets:
        by_raffle.setdefault(t.raffle_id, []).append(t)

    out: list[RaffleAssignmentDTO] = []
    for rid, group in by_raffle.items():
        raffle = raffles_map.get(rid)
        if not raffle:
            continue
        # Verificar tenancy
        if scope.tenant_id is not None and raffle.tenant_id != scope.tenant_id:
            continue

        dto_tickets = [
            AssignmentTicketDTO(
                id=t.id,
                number_label=t.number_label,
                code=t.code,
                status=t.status.value,
                has_customer=t.customer_id is not None,
                paid_amount=float(t.paid_amount or 0),
            )
            for t in group
        ]
        removable = sum(
            1
            for t in group
            if t.status == TicketStatus.AVAILABLE
            and t.customer_id is None
            and t.id not in active_res_ids
        )

        out.append(
            RaffleAssignmentDTO(
                raffle_id=rid,
                raffle_name=raffle.name,
                raffle_status=raffle.status.value if hasattr(raffle.status, "value") else str(raffle.status),
                final_draw_date=raffle.final_draw_date.isoformat(),
                total_tickets=raffle.total_tickets,
                assigned_count=len(group),
                removable_count=removable,
                available_pool=pool_map.get(rid, 0),
                tickets=dto_tickets,
            )
        )
    return out


# ============ Quitar boletas a un vendedor ============


@router.post(
    "/raffles/{raffle_id}/seller/{seller_id}/unassign",
)
async def unassign_tickets(
    raffle_id: int,
    seller_id: int,
    payload: UnassignRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Quita boletas a un vendedor.

    Reglas:
      - Solo se pueden quitar boletas `available` sin cliente y sin reserva
        activa. Cualquier otra (reservada, pagada, ganadora) bloquea la
        operación con detalle.
      - Si se pasa `ticket_ids`, se quitan esas exactas.
      - Si se pasa `quantity`, se quitan las N últimas disponibles del rango.
      - No se permite pasar ambos.
    """
    if (payload.ticket_ids and payload.quantity) or (not payload.ticket_ids and not payload.quantity):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "envía ticket_ids o quantity, no ambos ni vacío",
        )

    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)

    # Boletas del vendedor en esta rifa
    seller_tickets = (
        await db.execute(
            select(Ticket).where(
                Ticket.raffle_id == raffle_id, Ticket.seller_id == seller_id
            ).order_by(Ticket.number_label)
        )
    ).scalars().all()
    if not seller_tickets:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "este vendedor no tiene boletas en esta rifa")

    # Reservas activas
    ticket_ids_all = [t.id for t in seller_tickets]
    active_res_ids = set(
        (
            await db.execute(
                select(Reservation.ticket_id).where(
                    Reservation.ticket_id.in_(ticket_ids_all),
                    Reservation.is_active.is_(True),
                )
            )
        ).scalars().all()
    )

    def is_removable(t: Ticket) -> bool:
        return (
            t.status == TicketStatus.AVAILABLE
            and t.customer_id is None
            and t.id not in active_res_ids
        )

    target: list[Ticket] = []
    if payload.ticket_ids:
        wanted = set(payload.ticket_ids)
        by_id = {t.id: t for t in seller_tickets}
        # Validar que todas pertenezcan al vendedor
        missing = wanted - set(by_id.keys())
        if missing:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"estas boletas no pertenecen al vendedor: {sorted(missing)}",
            )
        blocked = [t for tid, t in by_id.items() if tid in wanted and not is_removable(t)]
        if blocked:
            labels = ", ".join(b.number_label for b in blocked)
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"no se pueden quitar boletas con cliente o reserva: {labels}",
            )
        target = [by_id[i] for i in wanted]
    else:
        # quantity → tomar las últimas N removibles
        removables = [t for t in seller_tickets if is_removable(t)]
        if len(removables) < payload.quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"solo hay {len(removables)} boletas disponibles para quitar (pediste {payload.quantity})",
            )
        # Las últimas según number_label
        target = sorted(removables, key=lambda x: x.number_label)[-payload.quantity:]

    for t in target:
        t.seller_id = None

    await log_action(
        db, actor_id=actor.id, action="assignment.unassign",
        entity_type="raffle", entity_id=raffle_id, request=request,
        metadata={
            "seller_id": seller_id,
            "ticket_ids": [t.id for t in target],
            "labels": [t.number_label for t in target],
            "count": len(target),
        },
    )
    await db.commit()
    return {"unassigned": len(target), "ticket_ids": [t.id for t in target]}


# ============ Agregar más boletas a un vendedor ============


@router.post(
    "/raffles/{raffle_id}/seller/{seller_id}/assign-more",
)
async def assign_more_tickets(
    raffle_id: int,
    seller_id: int,
    payload: AssignMoreRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Asigna N boletas más al vendedor desde el pool de disponibles (sin
    vendedor y con status=available). Toma las primeras N por number_label
    (orden ascendente) para que sea predecible.

    Si solo hay K < N disponibles, asigna K y devuelve aviso. Si no hay
    ninguna disponible → 409.
    """
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)
    if not raffle.numbers_generated:
        raise HTTPException(status.HTTP_409_CONFLICT, "la rifa no tiene números generados")

    seller = (
        await db.execute(select(User).where(User.id == seller_id, User.role == UserRole.SELLER))
    ).scalar_one_or_none()
    if not seller:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "vendedor no encontrado")
    if seller.tenant_id != raffle.tenant_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "el vendedor no pertenece a la rifa")

    pool = (
        await db.execute(
            select(Ticket)
            .where(
                Ticket.raffle_id == raffle_id,
                Ticket.seller_id.is_(None),
                Ticket.status == TicketStatus.AVAILABLE,
            )
            .order_by(Ticket.number_label)
            .limit(payload.quantity)
        )
    ).scalars().all()

    if not pool:
        raise HTTPException(status.HTTP_409_CONFLICT, "no quedan boletas disponibles en esta rifa")

    for t in pool:
        t.seller_id = seller_id

    await log_action(
        db, actor_id=actor.id, action="assignment.assign_more",
        entity_type="raffle", entity_id=raffle_id, request=request,
        metadata={
            "seller_id": seller_id,
            "requested": payload.quantity,
            "assigned": len(pool),
            "ticket_ids": [t.id for t in pool],
            "labels": [t.number_label for t in pool],
        },
    )
    await db.commit()
    return {
        "assigned": len(pool),
        "requested": payload.quantity,
        "ticket_ids": [t.id for t in pool],
        "labels": [t.number_label for t in pool],
        "partial": len(pool) < payload.quantity,
    }
