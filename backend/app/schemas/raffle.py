from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator

from app.models.raffle import RaffleMode, RaffleStatus


# -------- Commission Tier ----------

class CommissionTier(BaseModel):
    from_count: int = Field(ge=1, description="Cantidad mínima de boletas vendidas para alcanzar este tramo")
    to_count: Optional[int] = Field(default=None, ge=1, description="Cantidad máxima. null = sin límite superior (último tramo)")
    amount_per_ticket: Decimal = Field(ge=0, description="Pesos colombianos por boleta cuando el vendedor cae en este tramo")

    @model_validator(mode="after")
    def _validate_range(self):
        if self.to_count is not None and self.to_count < self.from_count:
            raise ValueError(f"to_count ({self.to_count}) no puede ser menor que from_count ({self.from_count})")
        return self


def validate_commission_tiers(tiers: List["CommissionTier"]) -> None:
    """Valida que la lista de tramos sea coherente: ordenada, sin gaps, último tramo abierto opcionalmente."""
    if not tiers:
        return
    ordered = sorted(tiers, key=lambda t: t.from_count)
    if ordered[0].from_count != 1:
        raise ValueError("el primer tramo debe comenzar en from_count=1")
    for i, tier in enumerate(ordered):
        if i == len(ordered) - 1:
            continue  # último tramo: to_count puede ser null
        if tier.to_count is None:
            raise ValueError("solo el último tramo puede tener to_count=null")
        next_from = ordered[i + 1].from_count
        if next_from != tier.to_count + 1:
            raise ValueError(
                f"los tramos deben ser contiguos sin huecos: tramo termina en {tier.to_count}, siguiente empieza en {next_from}"
            )


# -------- Prize ----------

class PrizeBase(BaseModel):
    position: int = Field(ge=1)
    name: str = Field(min_length=2, max_length=200)
    description: Optional[str] = None
    estimated_value: Optional[Decimal] = None
    draw_date: date
    image_url: Optional[str] = None


class PrizeCreate(PrizeBase):
    pass


class PrizeUpdate(BaseModel):
    position: Optional[int] = Field(default=None, ge=1)
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    description: Optional[str] = None
    estimated_value: Optional[Decimal] = None
    draw_date: Optional[date] = None
    image_url: Optional[str] = None


class PrizeOut(PrizeBase):
    id: int
    raffle_id: int
    winning_number: Optional[str] = None

    class Config:
        from_attributes = True


# -------- Raffle ----------

class PackageOption(BaseModel):
    size: int = Field(ge=1, description="Cantidad de números incluidos en el paquete")
    price: Decimal = Field(gt=0, description="Precio del paquete (COP)")


class RaffleCreate(BaseModel):
    # Solo aplica cuando el creador es super_admin (debe indicar a qué tenant
    # va la rifa). Para usuarios admin de un tenant se ignora y se usa el tenant
    # del usuario autenticado.
    tenant_id: Optional[int] = None

    # Modalidad de venta. 'classic' por defecto.
    mode: RaffleMode = RaffleMode.CLASSIC

    # Paquetes para mode='package'. Ej:
    #   [{"size":30,"price":12000}, {"size":50,"price":20000}, {"size":100,"price":36000}]
    package_options: Optional[List[PackageOption]] = None
    # Mínimo de paquete que un cliente puede comprar (en cantidad de números).
    min_package_size: Optional[int] = Field(default=None, ge=1)

    name: str = Field(min_length=3, max_length=200)
    description: Optional[str] = None
    total_tickets: int = Field(ge=1, default=500)
    numbers_per_ticket: int = Field(ge=1, default=20)
    number_min: int = Field(ge=0, default=0)
    number_max: int = Field(ge=1, default=9999)
    number_digits: int = Field(ge=1, le=10, default=4)
    ticket_price: Decimal = Field(gt=0)
    seller_commission: Decimal = Field(ge=0, default=0)
    commission_tiers: Optional[List[CommissionTier]] = Field(default=None)
    min_paid_threshold: int = Field(ge=1, default=200, description="Boletas pagadas mínimas para poder lanzar el sorteo")
    final_draw_date: date
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    lottery_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None
    responsible_email: Optional[str] = None
    terms: Optional[str] = None
    prizes: List[PrizeCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_numbers(self):
        total_numbers = self.number_max - self.number_min + 1
        required = self.total_tickets * self.numbers_per_ticket
        if total_numbers != required:
            raise ValueError(
                f"el rango ({total_numbers}) no coincide con total_tickets*numbers_per_ticket ({required})"
            )
        return self

    @model_validator(mode="after")
    def _validate_tiers(self):
        if self.commission_tiers:
            validate_commission_tiers(self.commission_tiers)
        return self

    @model_validator(mode="after")
    def _validate_mode(self):
        """Validaciones cruzadas según la modalidad."""
        if self.mode in (RaffleMode.PACKAGE, RaffleMode.EXPRESS):
            # En modalidades por número individual: 1 número por ticket.
            if self.numbers_per_ticket != 1:
                raise ValueError(
                    "en modo Premium/Express, numbers_per_ticket debe ser 1 (cada ticket es un solo número)"
                )
            if self.mode == RaffleMode.PACKAGE:
                if not self.package_options or len(self.package_options) < 1:
                    raise ValueError(
                        "en modo Premium debes definir al menos un paquete en package_options"
                    )
                # Cada paquete debe caber en el total de números
                for opt in self.package_options:
                    if opt.size > self.total_tickets:
                        raise ValueError(
                            f"el paquete de {opt.size} excede el total ({self.total_tickets})"
                        )
                if self.min_package_size is None:
                    self.min_package_size = min(o.size for o in self.package_options)
        else:
            # Classic: no debe traer package_options ni min_package_size
            if self.package_options:
                raise ValueError("package_options solo aplica en modo Premium")
            if self.min_package_size:
                raise ValueError("min_package_size solo aplica en modo Premium")
        return self


class RafflePostpone(BaseModel):
    new_final_draw_date: date
    reason: Optional[str] = Field(default=None, max_length=500)
    # Si se pasa, también desplaza las fechas de los premios pendientes.
    # Cada item es {prize_id: int, new_draw_date: date}.
    prize_dates: Optional[List[dict]] = None


class RaffleCancel(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    refund_contact: Optional[str] = Field(default=None, max_length=200,
        description="Cómo contactar al organizador para el reembolso (Nequi, banco, etc.)")
    refund_message: Optional[str] = Field(default=None, max_length=1000,
        description="Mensaje personalizado sobre el reembolso. Si no se pasa, se usa un mensaje genérico empático.")


class RaffleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    final_draw_date: Optional[date] = None
    min_paid_threshold: Optional[int] = Field(default=None, ge=1)
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    lottery_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None
    responsible_email: Optional[str] = None
    terms: Optional[str] = None


class RaffleOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    mode: RaffleMode = RaffleMode.CLASSIC
    package_options: Optional[List[PackageOption]] = None
    min_package_size: Optional[int] = None
    total_tickets: int
    numbers_per_ticket: int
    number_min: int
    number_max: int
    number_digits: int
    ticket_price: Decimal
    seller_commission: Decimal
    commission_tiers: Optional[List[CommissionTier]] = None
    min_paid_threshold: int = 200
    final_draw_date: date
    status: RaffleStatus
    numbers_generated: bool
    numbers_generated_at: Optional[datetime]
    logo_url: Optional[str]
    primary_color: Optional[str]
    lottery_name: Optional[str] = None
    responsible_name: Optional[str] = None
    responsible_phone: Optional[str] = None
    responsible_email: Optional[str] = None
    terms: Optional[str] = None
    prizes: List[PrizeOut] = Field(default_factory=list)

    class Config:
        from_attributes = True
