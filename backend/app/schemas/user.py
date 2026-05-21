from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=6, max_length=128)
    role: UserRole
    phone: Optional[str] = None
    default_commission: Optional[Decimal] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    default_commission: Optional[Decimal] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    phone: Optional[str]
    is_active: bool
    default_commission: Optional[Decimal]

    class Config:
        from_attributes = True


class SellerSummary(BaseModel):
    """Vendedor + métricas agregadas reales (no la config default_commission)."""
    id: int
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    is_active: bool
    default_commission: Optional[Decimal] = None
    paid_tickets: int
    commission_total: Decimal
    commission_paid: Decimal
    commission_pending: Decimal


class SellerAssignmentCreate(BaseModel):
    raffle_id: int
    seller_id: int
    quantity: int = Field(gt=0, description="Cantidad de boletas a asignar al final del rango disponible")


class SellerAssignmentOut(BaseModel):
    id: int
    raffle_id: int
    seller_id: int
    from_ticket: int
    to_ticket: int
    status: str
    note: Optional[str]

    class Config:
        from_attributes = True
