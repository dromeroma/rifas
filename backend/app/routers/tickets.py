from datetime import datetime, timezone
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import TenantScope, assert_tenant_owns, get_current_user, get_tenant_scope, require_roles
from app.models.raffle import Raffle
from app.models.reservation import Reservation
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_number import TicketNumber
from app.models.user import User, UserRole
from app.schemas.ticket import (
    ExtendReservationRequest, MarkPrintedRequest, PrintDataResponse, PrintTicketItem,
    ReservePackageRequest, ReservePackageResult, ReserveRequest, TicketOut, TicketSummary,
)
from app.services.audit_service import log_action
from app.services.image_service import build_ticket_image
from app.services.pdf_service import build_ticket_pdf
from app.services.qr_service import build_verify_url, generate_qr_png
from app.services.reservation_service import (
    mark_ticket_paid,
    release_by_ticket,
    reserve_package,
    reserve_ticket,
)

router = APIRouter(tags=["tickets"])


async def _load_ticket_out(db: AsyncSession, ticket_id: int) -> TicketOut | None:
    """Carga el ticket completo y devuelve el DTO con customer, seller y expira."""
    res = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.numbers),
            selectinload(Ticket.customer),
            selectinload(Ticket.seller),
        )
        .where(Ticket.id == ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        return None

    dto = TicketOut.model_validate(ticket)

    if ticket.status in (
        TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT, TicketStatus.PARTIALLY_PAID,
    ):
        exp = await db.execute(
            select(Reservation.expires_at)
            .where(
                Reservation.ticket_id == ticket.id,
                Reservation.is_active.is_(True),
            )
            .order_by(Reservation.id.desc())
            .limit(1)
        )
        expires_at = exp.scalar_one_or_none()
        if expires_at:
            dto.reservation_expires_at = expires_at
    return dto


async def _verify_raffle_tenancy(db: AsyncSession, raffle_id: int, scope: TenantScope) -> Raffle:
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    assert_tenant_owns(scope, raffle.tenant_id)
    return raffle


async def _verify_ticket_tenancy(db: AsyncSession, ticket_id: int, scope: TenantScope) -> Ticket:
    res = await db.execute(
        select(Ticket).join(Raffle, Raffle.id == Ticket.raffle_id).where(Ticket.id == ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")
    raffle = (await db.execute(select(Raffle).where(Raffle.id == ticket.raffle_id))).scalar_one()
    assert_tenant_owns(scope, raffle.tenant_id)
    return ticket


@router.get("/raffles/{raffle_id}/tickets", response_model=List[TicketSummary])
async def list_tickets(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    await _verify_raffle_tenancy(db, raffle_id, scope)
    res = await db.execute(
        select(Ticket).where(Ticket.raffle_id == raffle_id).order_by(Ticket.number_label)
    )
    return res.scalars().all()


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    await _verify_ticket_tenancy(db, ticket_id, scope)
    dto = await _load_ticket_out(db, ticket_id)
    if not dto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")
    return dto


@router.post("/tickets/reserve-package", response_model=ReservePackageResult, status_code=status.HTTP_201_CREATED)
async def reserve_package_endpoint(
    payload: ReservePackageRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Reserva atómicamente N números aleatorios disponibles para un cliente
    en una rifa de modo PACKAGE. Sirve para el flujo de venta de paquetes
    estilo 'rifa de moto' (Facebook): el vendedor escoge un tamaño de
    paquete válido y el sistema asigna los números."""
    from app.models.ticket_number import TicketNumber

    # Verificar tenancy
    await _verify_raffle_tenancy(db, payload.raffle_id, scope)

    tickets = await reserve_package(
        db,
        raffle_id=payload.raffle_id,
        package_size=payload.package_size,
        seller_id=actor.id,
        customer_id=payload.customer_id,
    )

    await log_action(
        db, actor_id=actor.id, action="package.reserve",
        entity_type="raffle", entity_id=payload.raffle_id, request=request,
        metadata={
            "package_size": payload.package_size,
            "customer_id": payload.customer_id,
            "ticket_ids": [t.id for t in tickets],
        },
    )
    await db.commit()

    # Cargar los números asignados a cada ticket para devolverlos al frontend
    ticket_ids = [t.id for t in tickets]
    nums_rows = (
        await db.execute(
            select(TicketNumber)
            .where(TicketNumber.ticket_id.in_(ticket_ids))
            .order_by(TicketNumber.ticket_id, TicketNumber.position)
        )
    ).scalars().all()
    nums_by_ticket: dict[int, list[str]] = {}
    for n in nums_rows:
        nums_by_ticket.setdefault(n.ticket_id, []).append(n.number)

    labels = [t.number_label for t in tickets]
    numbers_flat: list[str] = []
    for tid in ticket_ids:
        numbers_flat.extend(nums_by_ticket.get(tid, []))

    return ReservePackageResult(
        reserved=len(tickets),
        raffle_id=payload.raffle_id,
        customer_id=payload.customer_id,
        ticket_ids=ticket_ids,
        labels=labels,
        numbers=numbers_flat,
    )


@router.post("/tickets/{ticket_id}/reserve", response_model=TicketOut)
async def reserve(
    ticket_id: int,
    payload: ReserveRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    await _verify_ticket_tenancy(db, ticket_id, scope)
    reservation = await reserve_ticket(
        db, ticket_id=ticket_id, seller_id=actor.id, customer_id=payload.customer_id
    )
    await log_action(
        db, actor_id=actor.id, action="ticket.reserve",
        entity_type="ticket", entity_id=ticket_id, request=request,
        metadata={"customer_id": payload.customer_id, "expires_at": reservation.expires_at.isoformat()},
    )
    await db.commit()
    return await _load_ticket_out(db, ticket_id)


@router.post("/tickets/{ticket_id}/release", response_model=TicketOut)
async def release_ticket(
    ticket_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Libera una reserva. El vendedor solo puede liberar las suyas; admin puede liberar cualquiera."""
    ticket = await _verify_ticket_tenancy(db, ticket_id, scope)

    if ticket.status not in (TicketStatus.RESERVED, TicketStatus.PENDING_PAYMENT, TicketStatus.PARTIALLY_PAID):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"la boleta no está reservada (estado actual: {ticket.status.value})",
        )

    # Permisos: vendedor solo libera las propias
    if actor.role == UserRole.SELLER and ticket.seller_id != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no puedes liberar una boleta que no es tuya")

    # Si tiene pagos parciales confirmados, solo el admin puede liberar (decisión consciente).
    if ticket.status == TicketStatus.PARTIALLY_PAID and actor.role == UserRole.SELLER:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "la boleta tiene pagos parciales confirmados — solo un admin puede liberarla",
        )

    released = await release_by_ticket(db, ticket_id=ticket_id, reason="cancelled_by_user")
    if not released:
        raise HTTPException(status.HTTP_409_CONFLICT, "no hay reserva activa para liberar")

    await log_action(
        db, actor_id=actor.id, action="ticket.release",
        entity_type="ticket", entity_id=ticket_id, request=request,
    )
    await db.commit()
    return await _load_ticket_out(db, ticket_id)


@router.post("/tickets/{ticket_id}/extend-reservation", response_model=TicketOut)
async def extend_reservation(
    ticket_id: int,
    payload: ExtendReservationRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Extiende la reserva activa de una boleta N horas. Solo admin.

    Útil cuando el cliente está pagando en cuotas y se le acaba el plazo de
    24h original — el admin extiende manualmente. Si no hay reserva activa,
    devuelve 409.
    """
    from datetime import datetime, timedelta, timezone

    await _verify_ticket_tenancy(db, ticket_id, scope)

    if payload.hours <= 0 or payload.hours > 24 * 30:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "horas debe estar entre 1 y 720 (30 días)")

    res = (
        await db.execute(
            select(Reservation).where(
                Reservation.ticket_id == ticket_id,
                Reservation.is_active.is_(True),
            ).with_for_update()
        )
    ).scalar_one_or_none()
    if not res:
        raise HTTPException(status.HTTP_409_CONFLICT, "la boleta no tiene una reserva activa")

    now = datetime.now(timezone.utc)
    # Si ya venció, se extiende desde ahora; si todavía no vence, se suma al actual.
    base = res.expires_at if res.expires_at > now else now
    res.expires_at = base + timedelta(hours=payload.hours)

    await log_action(
        db, actor_id=actor.id, action="ticket.extend_reservation",
        entity_type="ticket", entity_id=ticket_id, request=request,
        metadata={"hours": payload.hours, "new_expires_at": res.expires_at.isoformat()},
    )
    await db.commit()
    return await _load_ticket_out(db, ticket_id)


@router.post("/tickets/{ticket_id}/mark-paid", response_model=TicketOut)
async def mark_paid(
    ticket_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Marca la boleta como pagada. El vendedor solo puede marcar las suyas."""
    ticket = await _verify_ticket_tenancy(db, ticket_id, scope)

    if actor.role == UserRole.SELLER and ticket.seller_id != actor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no puedes marcar pagada una boleta que no es tuya")

    await mark_ticket_paid(db, ticket_id=ticket_id, actor_id=actor.id)
    await log_action(
        db, actor_id=actor.id, action="ticket.mark_paid",
        entity_type="ticket", entity_id=ticket_id, request=request,
    )
    await db.commit()
    return await _load_ticket_out(db, ticket_id)


@router.get("/tickets/{ticket_id}/qr")
async def get_qr(ticket_id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    ticket = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")
    png = generate_qr_png(build_verify_url(ticket.code))
    return Response(content=png, media_type="image/png")


@router.get("/tickets/{ticket_id}/pdf")
async def get_pdf(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    await _verify_ticket_tenancy(db, ticket_id, scope)
    res = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.numbers))
        .where(Ticket.id == ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == ticket.raffle_id)
        )
    ).scalar_one()

    numbers_ordered = [n.number for n in sorted(ticket.numbers, key=lambda x: x.position)]
    prizes = [{"name": p.name, "draw_date": p.draw_date.isoformat()} for p in raffle.prizes]
    pdf = build_ticket_pdf(
        raffle_name=raffle.name,
        ticket_label=ticket.number_label,
        ticket_code=ticket.code,
        qr_payload=ticket.qr_payload,
        numbers=numbers_ordered,
        prizes=prizes,
        primary_color=raffle.primary_color,
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="boleta-{ticket.code}.pdf"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.get("/tickets/{ticket_id}/image")
async def get_image(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(get_current_user)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Genera un PNG de la boleta — ideal para compartir por WhatsApp."""
    await _verify_ticket_tenancy(db, ticket_id, scope)
    res = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.numbers), selectinload(Ticket.customer))
        .where(Ticket.id == ticket_id)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == ticket.raffle_id)
        )
    ).scalar_one()

    numbers_ordered = [n.number for n in sorted(ticket.numbers, key=lambda x: x.position)]
    prizes = [{"name": p.name, "draw_date": p.draw_date.isoformat()} for p in raffle.prizes]
    png = build_ticket_image(
        raffle_name=raffle.name,
        ticket_label=ticket.number_label,
        ticket_code=ticket.code,
        numbers=numbers_ordered,
        prizes=prizes,
        customer_name=ticket.customer.full_name if ticket.customer else None,
        is_paid=ticket.status in (TicketStatus.PAID, TicketStatus.WINNING),
        primary_color=raffle.primary_color,
        lottery_name=raffle.lottery_name,
        responsible_name=raffle.responsible_name,
        responsible_phone=raffle.responsible_phone,
        final_draw_date=raffle.final_draw_date.isoformat(),
    )
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="boleta-{ticket.code}.png"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


# ============ Buscar boleta por número ============


@router.get("/raffles/{raffle_id}/search-number")
async def search_by_number(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SELLER))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    n: str = Query(..., min_length=1, max_length=10, description="Número buscado, ej '1757'"),
):
    """Busca qué boleta contiene un número específico dentro de una rifa.

    Scope automático según rol del actor:
      - ADMIN / SUPER_ADMIN: busca en TODAS las boletas de la rifa
      - SELLER: solo entre las boletas que tiene asignadas (seller_id = self.id)

    Útil cuando:
      - Un cliente pide una boleta que contenga un número específico
      - Sale el número ganador y hay que identificar al dueño al instante

    Devuelve la boleta encontrada con su estado, posición del número en la
    cancha, cliente y vendedor. Si el seller no tiene asignada la boleta
    con ese número, devuelve found=false con un mensaje claro (no expone
    información de boletas ajenas).
    """
    raffle = await _verify_raffle_tenancy(db, raffle_id, scope)

    # Normaliza al ancho del number_digits de la rifa para tolerar inputs
    # como '57' cuando el formato es '0057'.
    raw = n.strip()
    if not raw.isdigit():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "el número solo puede contener dígitos",
        )
    digits = int(raffle.number_digits or 4)
    candidates = {raw, raw.zfill(digits), raw.lstrip("0") or "0"}

    tn = (
        await db.execute(
            select(TicketNumber).where(
                TicketNumber.raffle_id == raffle_id,
                TicketNumber.number.in_(list(candidates)),
            )
        )
    ).scalar_one_or_none()

    if not tn:
        return {
            "found": False,
            "number": raw,
            "message": f"El número {raw} no existe en esta rifa.",
        }

    # Cargar ticket + relaciones
    ticket = (
        await db.execute(
            select(Ticket)
            .options(
                selectinload(Ticket.numbers),
                selectinload(Ticket.customer),
                selectinload(Ticket.seller),
            )
            .where(Ticket.id == tn.ticket_id)
        )
    ).scalar_one()

    # Scope para seller: solo puede ver SUS boletas
    if actor.role == UserRole.SELLER and ticket.seller_id != actor.id:
        return {
            "found": False,
            "scoped_to_seller": True,
            "number": tn.number,
            "message": (
                f"El número {tn.number} existe en esta rifa pero no está en "
                "las boletas que tienes asignadas."
            ),
        }

    return {
        "found": True,
        "number": tn.number,
        "position_in_field": tn.position,  # 1..20, dónde aparece en la cancha
        "ticket": {
            "id": ticket.id,
            "number_label": ticket.number_label,
            "code": ticket.code,
            "status": ticket.status.value,
            "all_numbers": [
                n.number for n in sorted(ticket.numbers, key=lambda x: x.position)
            ],
            "customer": (
                {
                    "id": ticket.customer.id,
                    "full_name": ticket.customer.full_name,
                    "phone": ticket.customer.phone,
                }
                if ticket.customer
                else None
            ),
            "seller": (
                {
                    "id": ticket.seller.id,
                    "full_name": ticket.seller.full_name,
                    "phone": ticket.seller.phone,
                }
                if ticket.seller
                else None
            ),
        },
    }


# ============ Impresión física de boletas (admin only) ============

def _short_code(code: str) -> str:
    """4 chars en mayúsculas, sin guiones, derivados del `code` único. Sirve
    como código de respaldo para escribir/leer a mano si el QR falla."""
    return code.replace("-", "").upper()[:4]


@router.get("/raffles/{raffle_id}/print-data", response_model=PrintDataResponse)
async def get_print_data(
    raffle_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    seller_id: int | None = Query(None, description="boletas asignadas a este vendedor"),
    from_label: str | None = Query(None, description="rango: número inicial (ej. '001')"),
    to_label: str | None = Query(None, description="rango: número final (ej. '050')"),
    only_unprinted: bool = Query(False, description="solo boletas que no se han impreso aún"),
):
    """Devuelve todo lo necesario para imprimir boletas en hojas carta.

    Dos modos de uso:
      A) seller_id=X → todas las boletas asignadas al vendedor X (uso típico
         cuando se le entregan los talones al vendedor).
      B) from_label='001' & to_label='050' → rango de boletas
         independiente de a quién están asignadas (uso del admin para
         imprimir un sub-lote arbitrario para verificar / recuperar).
    """
    if seller_id is None and not (from_label and to_label):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "indica 'seller_id' o un rango 'from_label' + 'to_label'",
        )

    raffle = await _verify_raffle_tenancy(db, raffle_id, scope)

    seller = None
    if seller_id is not None:
        seller = (await db.execute(select(User).where(User.id == seller_id))).scalar_one_or_none()
        if not seller:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "vendedor no encontrado")
        if scope.tenant_id is not None and seller.tenant_id != scope.tenant_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "el vendedor no pertenece a tu cuenta")
        if seller.role != UserRole.SELLER:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "solo se imprimen boletas de vendedores")

    q = (
        select(Ticket)
        .options(selectinload(Ticket.numbers))
        .where(Ticket.raffle_id == raffle_id)
        .order_by(Ticket.number_label)
    )
    if seller_id is not None:
        q = q.where(Ticket.seller_id == seller_id)
    if from_label is not None and to_label is not None:
        # Padding al ancho de la rifa para tolerar inputs como '1' o '01'
        digits = int(raffle.number_digits or 4) if hasattr(raffle, "number_digits") else 4
        # Usamos el ancho del number_label real (no number_digits, que es de los
        # números individuales). Asumimos 3 dígitos por defecto.
        fl = from_label.strip().zfill(3)
        tl = to_label.strip().zfill(3)
        # Asegurar rango ordenado
        if fl > tl:
            fl, tl = tl, fl
        q = q.where(Ticket.number_label >= fl, Ticket.number_label <= tl)
    if only_unprinted:
        q = q.where(Ticket.printed_at.is_(None))
    tickets = (await db.execute(q)).scalars().all()

    raffle_full = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == raffle_id)
        )
    ).scalar_one()

    items = [
        PrintTicketItem(
            ticket_id=t.id,
            number_label=t.number_label,
            code=t.code,
            short_code=_short_code(t.code),
            numbers=[n.number for n in sorted(t.numbers, key=lambda x: x.position)],
            printed_at=t.printed_at,
        )
        for t in tickets
    ]

    # Cuando es por rango (no seller específico), describimos el lote como
    # 'Rango N-M' en seller_name para que la cabecera del print muestre algo
    # significativo en lugar de un vendedor.
    if seller:
        seller_label = seller.full_name
        seller_phone_v = seller.phone
        seller_id_v = seller.id
    else:
        seller_label = f"Rango {from_label}–{to_label}"
        seller_phone_v = None
        # 0 sirve como sentinel "no es un vendedor real" sin chocar con FKs
        seller_id_v = 0

    return PrintDataResponse(
        raffle_id=raffle.id,
        raffle_name=raffle.name,
        ticket_price=raffle.ticket_price,
        final_draw_date=raffle.final_draw_date.isoformat(),
        primary_color=raffle.primary_color,
        logo_url=raffle.logo_url,
        lottery_name=raffle.lottery_name,
        responsible_name=raffle.responsible_name,
        responsible_phone=raffle.responsible_phone,
        seller_id=seller_id_v,
        seller_name=seller_label,
        seller_phone=seller_phone_v,
        prizes=[
            {
                "position": p.position,
                "name": p.name,
                "draw_date": p.draw_date.isoformat(),
                "estimated_value": float(p.estimated_value) if p.estimated_value else None,
                "image_url": p.image_url,
            }
            for p in sorted(raffle_full.prizes, key=lambda x: x.position)
        ],
        tickets=items,
    )


@router.post("/raffles/{raffle_id}/mark-printed", status_code=status.HTTP_200_OK)
async def mark_tickets_printed(
    raffle_id: int,
    payload: MarkPrintedRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
):
    """Marca un lote de boletas como impresas (printed_at = now). Las boletas
    deben pertenecer a la rifa indicada. Se usa después de disparar la
    impresión / descarga de PDF para llevar control de talones físicos."""
    await _verify_raffle_tenancy(db, raffle_id, scope)

    if not payload.ticket_ids:
        return {"updated": 0}

    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(Ticket)
        .where(Ticket.raffle_id == raffle_id, Ticket.id.in_(payload.ticket_ids))
        .values(printed_at=now)
    )
    updated = result.rowcount or 0

    await log_action(
        db, actor_id=actor.id, action="tickets.printed",
        entity_type="raffle", entity_id=raffle_id, request=request,
        metadata={"count": updated, "ticket_ids": payload.ticket_ids},
    )
    await db.commit()
    return {"updated": updated, "printed_at": now.isoformat()}
