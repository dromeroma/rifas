from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.exceptions import ImmutableRaffleError
from app.models.prize import Prize
from app.models.raffle import Raffle
from app.models.user import User, UserRole
from app.schemas.raffle import PrizeCreate, PrizeOut, PrizeUpdate, RaffleCreate, RaffleOut, RaffleUpdate
from app.services.audit_service import log_action
from app.services.number_generator import generate_raffle_numbers

router = APIRouter(prefix="/raffles", tags=["raffles"])


@router.get("", response_model=List[RaffleOut])
async def list_raffles(db: Annotated[AsyncSession, Depends(get_db)]):
    res = await db.execute(select(Raffle).options(selectinload(Raffle.prizes)).order_by(Raffle.id.desc()))
    return res.scalars().all()


@router.post("", response_model=RaffleOut, status_code=status.HTTP_201_CREATED)
async def create_raffle(
    payload: RaffleCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    tiers_data = (
        [t.model_dump(mode="json") for t in payload.commission_tiers]
        if payload.commission_tiers
        else None
    )
    raffle = Raffle(
        name=payload.name,
        description=payload.description,
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
async def get_raffle(raffle_id: int, db: Annotated[AsyncSession, Depends(get_db)]):
    res = await db.execute(
        select(Raffle).options(selectinload(Raffle.prizes)).where(Raffle.id == raffle_id)
    )
    raffle = res.scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
    return raffle


@router.patch("/{raffle_id}", response_model=RaffleOut)
async def update_raffle(
    raffle_id: int,
    payload: RaffleUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")

    # Tras generar números, sólo permitimos cambiar campos cosméticos.
    if raffle.numbers_generated:
        forbidden = {"final_draw_date"}
        for k in forbidden:
            if getattr(payload, k) is not None:
                raise ImmutableRaffleError(f"no se puede modificar '{k}' tras generar números")

    for field, value in payload.model_dump(exclude_unset=True).items():
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
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
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
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
    raffle = (await db.execute(select(Raffle).where(Raffle.id == raffle_id))).scalar_one_or_none()
    if not raffle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rifa no encontrada")
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
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
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
        metadata={k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in data.items()},
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
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
):
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
