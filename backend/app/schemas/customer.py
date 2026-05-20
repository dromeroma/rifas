from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class CustomerCreate(BaseModel):
    full_name: str = Field(min_length=3, max_length=150)
    document: Optional[str] = None
    phone: str = Field(min_length=7, max_length=30)
    email: Optional[EmailStr] = None
    city: Optional[str] = None


class CustomerOut(CustomerCreate):
    id: int

    class Config:
        from_attributes = True
