"""Schemas para gestión de cuentas (tenants) — solo usables por super_admin."""

from datetime import date
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


_SLUG_PATTERN = r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$"


class TenantCreate(BaseModel):
    """Crea una cuenta nueva + su admin inicial en una sola operación."""
    name: str = Field(min_length=3, max_length=150, description="Nombre del negocio")
    slug: Optional[str] = Field(default=None, min_length=2, max_length=80, pattern=_SLUG_PATTERN)
    start_date: date
    end_date: date
    max_raffles: int = Field(ge=1, default=1)
    billing_email: Optional[EmailStr] = None
    billing_phone: Optional[str] = Field(default=None, max_length=30)
    notes: Optional[str] = None

    # Admin inicial de la cuenta
    admin_full_name: str = Field(min_length=3, max_length=150)
    admin_email: EmailStr
    admin_password: str = Field(min_length=6, max_length=128)
    admin_phone: Optional[str] = Field(default=None, max_length=30)

    @field_validator("end_date")
    @classmethod
    def _end_after_start(cls, v, info):
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date debe ser >= start_date")
        return v


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=3, max_length=150)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    max_raffles: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None
    billing_email: Optional[EmailStr] = None
    billing_phone: Optional[str] = Field(default=None, max_length=30)
    notes: Optional[str] = None


class TenantUsage(BaseModel):
    raffles_used: int
    raffles_max: int
    sellers_count: int
    admins_count: int


class TenantOut(BaseModel):
    id: int
    name: str
    slug: str
    start_date: date
    end_date: date
    max_raffles: int
    is_active: bool
    billing_email: Optional[EmailStr] = None
    billing_phone: Optional[str] = None
    notes: Optional[str] = None

    # Métricas agregadas (siempre devueltas; bajo costo).
    usage: TenantUsage
    # Status calculado: active | grace_period | expired | not_started | suspended
    subscription_status: str

    class Config:
        from_attributes = True
