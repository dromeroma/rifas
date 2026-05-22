from functools import cached_property, lru_cache
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Cargamos .env con override=True para que .env gane sobre variables de sistema.
# Buscamos primero en el directorio actual y luego en el padre.
_HERE = Path(__file__).resolve()
for candidate in (_HERE.parent.parent.parent / ".env", _HERE.parent.parent.parent.parent / ".env"):
    if candidate.is_file():
        load_dotenv(candidate, override=True)
        break


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "sistema-rifas"
    app_env: str = "development"
    app_debug: bool = True
    app_port: int = 8000
    frontend_url: str = "http://localhost:4200"

    # Database
    database_url: str = "postgresql+asyncpg://rifas:rifas_pass@db:5432/rifas"
    alembic_database_url: str | None = None

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Security
    jwt_secret_key: str = Field(..., min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expires_min: int = 15
    refresh_token_expires_days: int = 7
    bcrypt_rounds: int = 12

    # CORS (CSV en .env). Derivado vía `cors_origins` (lista).
    cors_origins_raw: str = Field(default="http://localhost:4200", alias="cors_origins")

    # Uploads
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 10

    # Reservas
    reservation_hours: int = 24
    lock_days_before_draw: int = 7

    # Resend (emails)
    resend_enabled: bool = False
    resend_api_key: str = ""
    resend_from_email: str = "onboarding@resend.dev"
    resend_from_name: str = "Boletera"
    admin_notify_email: str = ""

    # Token compartido para endpoints de cron job (notificaciones automáticas,
    # liberar reservas). Si se setea, los hits con header X-Cron-Secret=valor
    # son aceptados sin JWT.
    cron_secret: str = ""

    # Supabase Storage (opcional). Si SUPABASE_SERVICE_KEY está seteado, los
    # comprobantes de pago se suben a Supabase Storage en lugar de disco
    # local. Render free borra el disco en cada deploy, así que es
    # obligatorio en producción real.
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_storage_bucket: str = "payment-proofs"

    @cached_property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
