from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPair, UserOut
from app.services.audit_service import log_action

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        await log_action(
            db,
            actor_id=None,
            action="auth.login_failed",
            description=f"intento de login fallido: {payload.email}",
            request=request,
        )
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "credenciales inválidas")

    access = create_access_token(user.id, {"role": user.role.value})
    refresh = create_refresh_token(user.id)

    await log_action(
        db, actor_id=user.id, action="auth.login", request=request,
        description=f"login exitoso usuario {user.email}",
    )
    await db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    try:
        data = decode_token(payload.refresh_token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh inválido")
    if data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "tipo de token inválido")

    user_id = int(data["sub"])
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "usuario inválido")

    return TokenPair(
        access_token=create_access_token(user.id, {"role": user.role.value}),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return user
