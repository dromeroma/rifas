from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.audit_service import log_action

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=List[UserOut])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN))],
    role: Optional[UserRole] = Query(default=None),
    active: Optional[bool] = Query(default=None),
):
    q = select(User).order_by(User.id.desc())
    if role is not None:
        q = q.where(User.role == role)
    if active is not None:
        q = q.where(User.is_active == active)
    return (await db.execute(q)).scalars().all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "ya existe un usuario con ese email")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        phone=payload.phone,
        default_commission=payload.default_commission,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await log_action(
        db, actor_id=actor.id, action="user.create",
        entity_type="user", entity_id=user.id, request=request,
        metadata={"email": user.email, "role": user.role.value},
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "usuario no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if (pw := data.pop("password", None)):
        user.password_hash = hash_password(pw)
    for k, v in data.items():
        setattr(user, k, v)

    await log_action(
        db, actor_id=actor.id, action="user.update",
        entity_type="user", entity_id=user.id, request=request,
        metadata={k: v for k, v in data.items() if k != "password"},
    )
    await db.commit()
    await db.refresh(user)
    return user
