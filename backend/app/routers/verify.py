from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.raffle import Raffle
from app.models.ticket import Ticket, TicketStatus

router = APIRouter(prefix="/verify", tags=["public"])


# Router secundario sin prefijo /verify — montado en main.py para que
# /v/{code} sea una URL CORTA accesible directamente y/o vía Vercel rewrite
# desde /verify/{code} cuando las boletas impresas tienen la URL larga.
short_router = APIRouter(tags=["public"])


@short_router.get("/v/{code}", include_in_schema=True)
async def short_verify_redirect(
    code: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Endpoint de redirección rápida para QRs físicos escaneados.

    Cuando el usuario escanea un QR impreso con `/verify/{code}` (URL
    legacy), Vercel hace rewrite a este endpoint y nosotros respondemos
    con un 302 directo a la página premium de la rifa correcta. Esto
    evita el bootstrap de Angular para esta ruta — más rápido y sin
    riesgo de fallar por errores del bundle JS.

    Flujo:
      1. Usuario escanea QR → browser pide /verify/5J3-4KS-679
      2. Vercel rewrite → backend /v/5J3-4KS-679
      3. Backend lookup → ticket pertenece a raffle_id=5
      4. Backend responde 302 Location: /r/5?b=5J3-4KS-679
      5. Browser navega → carga raffle-promo de la rifa correcta

    Si el código no existe, redirige a la home con un querystring
    para mostrar mensaje de "boleta no encontrada".
    """
    res = await db.execute(select(Ticket).where(Ticket.code == code))
    ticket = res.scalar_one_or_none()

    if not ticket:
        # Code no existe — manda a home con un querystring para que el
        # frontend pueda mostrar un mensaje suave.
        return RedirectResponse(url=f"/?not_found={code}", status_code=302)

    # Redirige a la página premium de la rifa correcta, autoverificando
    # la boleta vía ?b=<code>.
    return RedirectResponse(
        url=f"/r/{ticket.raffle_id}?b={code}",
        status_code=302,
    )


@router.get("/{code}")
async def verify_public(code: str, db: Annotated[AsyncSession, Depends(get_db)]):
    """
    Endpoint público — devuelve sólo datos NO sensibles.
    Sin teléfono, sin nombre del cliente, sin información financiera.
    """
    res = await db.execute(
        select(Ticket).options(selectinload(Ticket.numbers)).where(Ticket.code == code)
    )
    ticket = res.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "boleta no encontrada")

    raffle = (
        await db.execute(
            select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == ticket.raffle_id)
        )
    ).scalar_one()

    return {
        "valid": True,
        "raffle": {
            "id": raffle.id,
            "name": raffle.name,
            "final_draw_date": raffle.final_draw_date.isoformat(),
            "lottery_name": raffle.lottery_name,
            "responsible_name": raffle.responsible_name,
            "responsible_phone": raffle.responsible_phone,
            "responsible_email": raffle.responsible_email,
            "terms": raffle.terms,
            "primary_color": raffle.primary_color,
        },
        "ticket": {
            "label": ticket.number_label,
            "code": ticket.code,
            "is_paid": ticket.status in (TicketStatus.PAID, TicketStatus.WINNING),
            "is_winner": ticket.status == TicketStatus.WINNING,
            # Orden por posición (NO por valor) para que la cancha 3-4-3
            # siempre pinte cada número en su lugar fijo.
            "numbers": [n.number for n in sorted(ticket.numbers, key=lambda x: x.position)],
        },
        "prizes": [
            {
                "name": p.name,
                "draw_date": p.draw_date.isoformat(),
                "winning_number": p.winning_number,
            }
            for p in raffle.prizes
        ],
    }
