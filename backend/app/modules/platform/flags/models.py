"""Modelo ORM de feature flags."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FeatureFlag(Base):
    """Estado de un flag para un tenant específico (o global).

    Convenciones:
      - `name` sigue el formato `<module>.<feature>` (ej. `wallet.cashback_ui`).
      - `tenant_id = NULL` significa "flag global" — se aplica a todos
        los tenants salvo que exista un override por tenant específico.
      - `expires_at` documenta cuándo se retira el flag (deuda técnica
        auto-visible). El sistema no lo usa para forzar retiro; sirve
        para reportes de flags "vencidos" que hay que limpiar.
      - `metadata` guarda contexto opcional (autor, ADR, notas).
    """

    __tablename__ = "feature_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    tenant_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # `metadata` es reservado por SQLAlchemy — usamos otro nombre en Python
    # pero conservamos `metadata` como nombre de columna SQL.
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        # Unicidad por (tenant, name). NULL en tenant_id se trata como
        # "global" y debe ser único también. Postgres considera NULL != NULL
        # en UNIQUE, así que agregamos un índice parcial para el caso NULL.
        UniqueConstraint(
            "tenant_id", "name", name="uq_feature_flags_tenant_name",
        ),
        Index(
            "ix_feature_flags_global_name",
            "name",
            unique=True,
            postgresql_where="tenant_id IS NULL",
        ),
    )

    def __repr__(self) -> str:
        scope = f"tenant={self.tenant_id}" if self.tenant_id else "global"
        return f"<FeatureFlag {self.name} {scope} enabled={self.enabled}>"
