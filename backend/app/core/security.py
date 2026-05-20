from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def hash_password(plain: str) -> str:
    """
    Hashea con bcrypt. bcrypt limita el secreto a 72 bytes; truncamos en UTF-8
    para evitar excepción cuando el usuario escribe contraseñas largas con tildes.
    """
    secret = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(secret, bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        secret = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(secret, hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _create_token(subject: str | int, expires: timedelta, token_type: str, claims: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int((now + expires).timestamp()),
        "type": token_type,
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str | int, claims: dict[str, Any] | None = None) -> str:
    return _create_token(
        subject,
        timedelta(minutes=settings.access_token_expires_min),
        "access",
        claims,
    )


def create_refresh_token(subject: str | int) -> str:
    return _create_token(
        subject,
        timedelta(days=settings.refresh_token_expires_days),
        "refresh",
    )


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise ValueError(f"token inválido: {e}") from e
