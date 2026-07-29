import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.exceptions import (
    DomainError,
    ImmutableRaffleError,
    ReservationLockedError,
    TicketUnavailableError,
)
from app.modules import _handlers  # noqa: F401 -- registra handlers cross-módulo
from app.modules.customer.router import router as perks_customers_router
from app.modules.perks_overview.router import router as perks_overview_router
from app.modules.platform.events import Dispatcher
from app.modules.platform.flags import is_enabled
from app.modules.rules.router import router as perks_rules_router
from app.routers import (
    admin, assignments, audit, auth, customers, payments, public,
    public_sales, public_sales_admin, raffles,
    stats, tenants, tickets, users, verify,
)
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, HTTPException
from typing import Annotated

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope

settings = get_settings()
logger = logging.getLogger(__name__)


# Nombre del flag que gobierna el arranque del dispatcher del event bus.
# Registrado en app.modules.platform.flags.registry con default=False —
# el dispatcher permanece apagado hasta el cutover post-freeze (ADR-006/007).
_DISPATCHER_FLAG = "platform.event_dispatcher"

# Flag que expone las rutas /api/v1/customers/* y /api/v1/rules/* del
# admin panel de Perks. Default OFF — con flag off los endpoints
# devuelven 404 (no aparecen efectivamente en runtime).
_PERKS_ADMIN_API_FLAG = "perks.admin_api"


async def require_perks_admin_api_enabled(
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> None:
    """Guard que corta cualquier request a /api/v1/* si el flag está OFF.

    Cache in-process del flag service (TTL 5s) mantiene el overhead
    bajo. Usa is_enabled con tenant_id — permite habilitar por tenant
    específico antes de un rollout global.
    """
    enabled = await is_enabled(
        _PERKS_ADMIN_API_FLAG, tenant_id=scope.tenant_id, db=db,
    )
    if not enabled:
        raise HTTPException(status_code=404, detail="not found")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Asegura que el directorio de uploads exista (en Render free es /tmp/uploads)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    # ── Event dispatcher (opt-in por feature flag) ──────────────
    # Consulta el flag directo desde BD para reflejar cambios sin restart.
    # Si el flag está off (default), el dispatcher NO arranca — cero
    # impacto en flujos legacy que no publican eventos todavía.
    dispatcher: Dispatcher | None = None
    try:
        async with AsyncSessionLocal() as db:
            flag_on = await is_enabled(_DISPATCHER_FLAG, db=db)
    except Exception:
        logger.exception(
            "no se pudo consultar %r al arrancar — dispatcher OFF por seguridad",
            _DISPATCHER_FLAG,
        )
        flag_on = False

    if flag_on:
        dispatcher = Dispatcher(sessionmaker=AsyncSessionLocal)
        await dispatcher.start()
        logger.info("event dispatcher arrancado (flag %s=on)", _DISPATCHER_FLAG)
    else:
        logger.info(
            "event dispatcher NO arrancado (flag %s=off) — comportamiento legacy",
            _DISPATCHER_FLAG,
        )

    try:
        yield
    finally:
        if dispatcher is not None:
            await dispatcher.stop()


app = FastAPI(
    title="Boletera API",
    version="0.1.0",
    description=(
        "API de Boletera — la plataforma que vuelve cualquier rifa en un negocio "
        "profesional. Boletas únicas, comisiones automáticas, verificación pública "
        "y trazabilidad total."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError):
    status_map = {
        ImmutableRaffleError: 409,
        ReservationLockedError: 423,
        TicketUnavailableError: 409,
    }
    code = status_map.get(type(exc), 400)
    return JSONResponse(status_code=code, content={"detail": str(exc), "error": exc.__class__.__name__})


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "env": settings.app_env}


app.include_router(auth.router)
app.include_router(raffles.router)
app.include_router(tickets.router)
app.include_router(stats.router)
app.include_router(users.router)
app.include_router(customers.router)
app.include_router(assignments.router)
app.include_router(payments.router)
app.include_router(audit.router)
app.include_router(admin.router)
app.include_router(verify.router)
app.include_router(verify.short_router)  # /v/{code} → redirect a /r/:id?b=code
app.include_router(public.router)
app.include_router(public_sales.router)         # /public/raffles/:id/available, checkout, webhook, auth
app.include_router(public_sales_admin.router)   # /admin/public-sales/*
app.include_router(tenants.router)

# ── Perks admin API (opt-in por flag perks.admin_api) ───────
# Routes bajo /api/v1/* con guard de flag que retorna 404 cuando
# está off. Auth ADMIN/SUPER_ADMIN + tenant scope obligatorio en
# cada endpoint. Cero exposición al usuario hasta que el panel
# frontend esté listo (Sprint 6b).
app.include_router(
    perks_customers_router,
    dependencies=[Depends(require_perks_admin_api_enabled)],
)
app.include_router(
    perks_rules_router,
    dependencies=[Depends(require_perks_admin_api_enabled)],
)
app.include_router(
    perks_overview_router,
    dependencies=[Depends(require_perks_admin_api_enabled)],
)
