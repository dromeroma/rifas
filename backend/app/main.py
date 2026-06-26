from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.exceptions import (
    DomainError,
    ImmutableRaffleError,
    ReservationLockedError,
    TicketUnavailableError,
)
from app.routers import (
    admin, assignments, audit, auth, customers, payments, public, raffles,
    stats, tenants, tickets, users, verify,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Asegura que el directorio de uploads exista (en Render free es /tmp/uploads)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    yield


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
app.include_router(tenants.router)
