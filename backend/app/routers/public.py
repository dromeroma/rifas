"""
Endpoints públicos (sin autenticación). Pensados para ser compartidos por
WhatsApp / redes sociales. No exponen datos sensibles ni nominales.
"""

import re
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.customer import Customer
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/raffles/{raffle_id}")
async def public_raffle_view(
    raffle_id: int, db: Annotated[AsyncSession, Depends(get_db)]
):
    """
    Vista pública de la rifa para clientes. No incluye:
    - Cantidad exacta de boletas vendidas (sólo porcentaje)
    - Información de vendedores, clientes ni pagos
    - Comisiones ni datos financieros internos

    Sí incluye:
    - Premios, fechas de sorteo
    - % de venta y umbral mínimo para sortear (como %)
    - Responsable y contacto público
    - Términos
    """
    raffle = (
        await db.execute(
            select(Raffle)
            .options(selectinload(Raffle.prizes))
            .where(Raffle.id == raffle_id)
        )
    ).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")

    sold = int(
        (
            await db.execute(
                select(func.count(Ticket.id)).where(
                    Ticket.raffle_id == raffle.id,
                    Ticket.status.in_([TicketStatus.PAID, TicketStatus.WINNING]),
                )
            )
        ).scalar_one()
        or 0
    )

    total = int(raffle.total_tickets or 0)
    threshold = int(raffle.min_paid_threshold or 0)

    sold_pct = round(min(sold / total * 100, 100), 2) if total else 0.0
    threshold_pct_of_total = round(threshold / total * 100, 2) if total else 0.0
    progress_to_threshold_pct = (
        round(min(sold / threshold * 100, 100), 2) if threshold else 0.0
    )
    can_run_draw = sold >= threshold

    today = date.today()
    upcoming = sorted(
        [p for p in raffle.prizes if p.draw_date >= today], key=lambda p: p.draw_date
    )
    next_draw = None
    if upcoming:
        p = upcoming[0]
        next_draw = {
            "name": p.name,
            "draw_date": p.draw_date.isoformat(),
            "days_remaining": max((p.draw_date - today).days, 0),
        }

    return {
        "id": raffle.id,
        "name": raffle.name,
        "description": raffle.description,
        "mode": getattr(raffle, "mode", "classic"),
        "package_options": raffle.package_options,
        "min_package_size": raffle.min_package_size,
        "lottery_name": raffle.lottery_name,
        "primary_color": raffle.primary_color,
        "logo_url": raffle.logo_url,
        "final_draw_date": raffle.final_draw_date.isoformat(),
        "days_to_final_draw": max((raffle.final_draw_date - today).days, 0),
        # Métricas agregadas (sin exponer cantidades absolutas vendidas).
        "total_tickets": total,
        "sold_pct": sold_pct,
        "threshold_pct_of_total": threshold_pct_of_total,
        "progress_to_threshold_pct": progress_to_threshold_pct,
        "can_run_draw": can_run_draw,
        # Premios ordenados (mayor → menores).
        "prizes": [
            {
                "position": p.position,
                "name": p.name,
                "description": p.description,
                "estimated_value": float(p.estimated_value) if p.estimated_value else None,
                "draw_date": p.draw_date.isoformat(),
                "image_url": p.image_url,
                "winning_number": p.winning_number,
            }
            for p in sorted(raffle.prizes, key=lambda x: x.position)
        ],
        "next_draw": next_draw,
        # Contacto público.
        "responsible_name": raffle.responsible_name,
        "responsible_phone": raffle.responsible_phone,
        "responsible_email": raffle.responsible_email,
        "terms": raffle.terms,
    }


def _normalize_phone(p: str) -> str:
    """Solo dígitos. Permite que el cliente escriba +57 300 123 4567 o 300-123-4567."""
    return re.sub(r"\D", "", p or "")


@router.get("/my-tickets")
async def my_tickets(
    db: Annotated[AsyncSession, Depends(get_db)],
    phone: str = Query(..., min_length=7, max_length=30, description="Teléfono del cliente (con o sin código país)"),
):
    """Portal del cliente: ingresa su teléfono y ve todas las boletas que tiene
    en cualquier rifa de Boletera (sin importar el tenant).

    No expone datos sensibles del organizador ni del vendedor. El teléfono
    actúa como pseudo-llave de autenticación: solo el dueño debería conocer
    todas las boletas asociadas a su número.
    """
    norm = _normalize_phone(phone)
    if len(norm) < 7:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "teléfono inválido")

    # Match exacto sobre los dígitos normalizados de los customers.
    # Hacemos LIKE sobre el último tramo (los últimos 10 dígitos) para
    # tolerar prefijos internacionales distintos al cargar.
    suffix = norm[-10:] if len(norm) >= 10 else norm
    customers = (
        await db.execute(
            select(Customer).where(
                func.regexp_replace(Customer.phone, r"\D", "", "g").like(f"%{suffix}")
            )
        )
    ).scalars().all()
    if not customers:
        return {"matched": False, "tickets": []}

    customer_ids = [c.id for c in customers]
    tickets = (
        await db.execute(
            select(Ticket)
            .options(selectinload(Ticket.numbers))
            .where(Ticket.customer_id.in_(customer_ids))
            .order_by(Ticket.id.desc())
        )
    ).scalars().all()

    if not tickets:
        return {"matched": True, "customer_name": customers[0].full_name, "tickets": []}

    # Cargar rifas referenciadas (1 query batched)
    raffle_ids = list({t.raffle_id for t in tickets})
    raffles_map = {
        r.id: r
        for r in (
            await db.execute(select(Raffle).where(Raffle.id.in_(raffle_ids)))
        ).scalars().all()
    }

    customer_by_id = {c.id: c for c in customers}

    items = []
    for t in tickets:
        r = raffles_map.get(t.raffle_id)
        c = customer_by_id.get(t.customer_id) if t.customer_id else None
        if not r:
            continue
        items.append({
            "ticket_id": t.id,
            "ticket_label": t.number_label,
            "ticket_code": t.code,
            "status": t.status.value,
            "is_paid": t.status in (TicketStatus.PAID, TicketStatus.WINNING),
            "is_winner": t.status == TicketStatus.WINNING,
            "numbers": sorted([n.number for n in t.numbers]),
            "customer_name": c.full_name if c else None,
            "raffle": {
                "id": r.id,
                "name": r.name,
                "final_draw_date": r.final_draw_date.isoformat(),
                "lottery_name": r.lottery_name,
                "responsible_phone": r.responsible_phone,
                "primary_color": r.primary_color,
            },
            "verify_url": f"/verify/{t.code}",
        })
    return {
        "matched": True,
        "customer_name": customers[0].full_name,
        "tickets": items,
    }
