from datetime import date
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class TenantInfo(BaseModel):
    id: int
    name: str
    slug: str
    end_date: date
    max_raffles: int
    subscription_status: str  # active | grace_period | expired


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    tenant_id: Optional[int] = None
    tenant: Optional[TenantInfo] = None
    # Solo para role=SELLER: slug para su link público de venta
    # (/rifa/:id/comprar?v=<slug>). Null para admins.
    public_slug: Optional[str] = None

    class Config:
        from_attributes = True
