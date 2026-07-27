# Template — cómo agregar un módulo nuevo

Guía práctica que sigues cuando abres un módulo nuevo en `apps/api/modules/`
(hoy `backend/app/modules/`). Sirve como checklist en el PR.

Este template refleja las decisiones firmadas en Fase 0:
- [ADR-001](decisions/ADR-001-modular-monolith.md) — boundaries por módulo.
- [ADR-002](decisions/ADR-002-event-bus-outbox.md) — comunicación por eventos.
- [ADR-003](decisions/ADR-003-multi-tenant-shared-db.md) — `tenant_id` en toda tabla.
- [ADR-007](decisions/ADR-007-zero-downtime-cutover.md) — checklist de PR.

---

## Estructura mínima

```
backend/app/modules/<module>/
├── __init__.py                 # exports públicos del módulo (superficie)
├── README.md                   # qué hace, qué eventos publica/consume, invariantes
├── models.py                   # SQLAlchemy models (extienden Base)
├── schemas.py                  # DTOs Pydantic (entrada/salida de la API)
├── service.py                  # lógica de dominio pura (sin request/response)
├── router.py                   # FastAPI router — thin, sin lógica
├── events.py                   # publicación + handlers (@registry.on)
└── errors.py                   # excepciones del módulo (subclase DomainError)
```

Cuando el módulo crece, se subdivide (por ejemplo `service/` como paquete
con submodules) pero manteniendo los boundaries de importación.

---

## Checklist para abrir el módulo

### 1. Documento del módulo — `README.md` del módulo

Cada módulo tiene su propio README corto que responde:

- **Qué representa** en el dominio (1 párrafo).
- **Agregados raíz** y sus invariantes.
- **Eventos que publica** (tabla).
- **Eventos que consume** (tabla).
- **Endpoints públicos** que expone.
- **Dependencias declaradas** (qué módulos importa y por qué).

Ejemplo mínimo:

```markdown
# customer

Núcleo del dominio: representación unificada del cliente final del tenant.

Agregado raíz: `Customer`. Invariantes:
- Todo customer tiene al menos una identity.
- (tenant, tipo_identity, valor) es único.

## Eventos publicados
| type | cuándo |
|---|---|
| customer.identified   | al crear customer nuevo |
| customer.merged       | tras merge de duplicados |

## Eventos consumidos
| type | efecto |
|---|---|
| (ninguno hoy) | |
```

### 2. Registrar los modelos ORM en el registry central

Todo módulo con tablas nuevas agrega su paquete `models` en
[`backend/app/modules/_alembic_metadata.py`](../backend/app/modules/_alembic_metadata.py):

```python
# customer
from app.modules.customer import models as _customer_models  # noqa: F401
```

Con esa línea, `alembic revision --autogenerate` detecta las tablas
nuevas y `Base.metadata.create_all` (usado en tests de integración)
también.

### 3. Migración Alembic — aditiva y reversible

Ver [ADR-007](decisions/ADR-007-zero-downtime-cutover.md) sección
"Migraciones aditivas y reversibles obligatorias":

- Solo `ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX CONCURRENTLY`, `CREATE TYPE`.
- Columnas nuevas `nullable=True` o con default constante.
- Índices con `CONCURRENTLY` (fuera de transacción).
- `downgrade()` que efectivamente revierte.

### 4. Multi-tenant en toda tabla del dominio

Todas las tablas de negocio llevan `tenant_id NOT NULL` + índice
compuesto que empiece con `tenant_id`:

```python
class Whatever(Base):
    __tablename__ = "whatevers"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    ...
    __table_args__ = (
        Index("ix_whatevers_tenant_something", "tenant_id", "something"),
    )
```

Excepción: tablas de plataforma como `event_outbox` (donde `tenant_id`
es nullable porque hay eventos `platform.*`).

### 5. Publicar eventos desde el service, no desde el router

El router valida entrada/salida y llama al service. El service ejecuta
la lógica y publica eventos:

```python
# service.py
from app.modules.platform.events import Event, Actor, ActorKind, Subject, publish

async def identify_customer(db, tenant_id: int, actor_id: int, ...):
    customer = Customer(...)
    db.add(customer)
    await db.flush()

    await publish(
        Event(
            type="customer.identified",
            tenant_id=tenant_id,
            actor=Actor(kind=ActorKind.MEMBER, id=actor_id),
            subject=Subject(kind="customer", id=customer.id),
            data={"channel": "admin_ui"},
        ),
        db,
    )

    await db.commit()
    return customer
```

### 6. Consumir eventos con `@registry.on`

Los handlers viven en `events.py` del módulo consumidor. Se importan
al arrancar la app (registro global) — asegurate de que el paquete
del módulo se importe en `app/main.py`.

```python
# events.py del módulo wallet
from app.modules.platform.events import Event, registry

@registry.on("customer.identified", handler_id="wallet.create_on_customer_identified")
async def _create_wallet(event: Event, db) -> None:
    # crear wallet con balances iniciales para el customer
    ...
```

Reglas del handler ([ADR-002](decisions/ADR-002-event-bus-outbox.md)):
- Idempotente (el dispatcher garantiza no llamarlo 2x con éxito, pero
  el código no debe fallar si accidentalmente ocurre).
- Timeout implícito (30s por default) — trabajo pesado va a jobs.
- Si emite eventos nuevos, propaga `context.trigger_event_id` +
  `causation_depth+1`.
- No importa código de otros módulos de dominio; solo interfaces
  públicas / eventos.

### 7. Respetar las reglas de dependencia

Verificadas en CI por `import-linter` (config en `backend/pyproject.toml`
sección `[tool.importlinter]`):

- `platform` es leaf — nunca importa de dominio.
- `identity`, `customer` son leaf de dominio.
- `wallet`, `rewards`, `gamification` **no se importan entre sí** — solo
  eventos.
- `rules`, `campaigns` solo importan interfaces declaradas.
- `adapters/*` solo tocan `platform`.

Correr localmente:

```bash
lint-imports  # falla el build si algún módulo viola contratos
```

### 8. Tests

Cada módulo tiene su carpeta bajo `backend/tests/modules/<module>/`.

Mínimo obligatorio:

- **Unit tests** del service (sin BD). Si el service depende del `db`,
  pásalo como mock o usa `AsyncMock`.
- **Integration tests** (marcados `@pytest.mark.integration`) para:
  - Flujos que involucran múltiples tablas.
  - Eventos que se publican + handlers que consumen.
  - Endpoints públicos end-to-end con `httpx.AsyncClient`.

Nomenclatura:
- `test_<qué>.py` para unit.
- `test_<qué>_integration.py` para integration.

### 9. Endpoints públicos — versionados y con tenant scope

- Prefijo `/api/v1/`.
- Auth obligatoria (dep `get_current_member` o `get_current_customer`).
- Tenant scope obligatorio (`TenantScope`) — sin excepción.
- OpenAPI documentado (docstrings + response_model).
- Errores en formato `{ code, message, details, request_id }`.

### 10. Feature flag si es user-facing durante freeze

Todo cambio visible al usuario final durante la ventana de freeze
(ADR-007) va detrás de un flag DB-based. Convención:
`<module>.<feature>` — ejemplo: `wallet.cashback_ui`.

Flags viejos con fecha de caducidad. Sin flags eternos.

---

## Checklist final del PR

Copiar en la descripción del PR:

```markdown
### Módulo nuevo
- [ ] Estructura de carpetas creada según template.
- [ ] README del módulo escrito.
- [ ] Modelos ORM registrados en `_alembic_metadata.py`.
- [ ] Migración Alembic aditiva y reversible.
- [ ] Todas las tablas de dominio con `tenant_id NOT NULL`.
- [ ] Eventos publicados documentados en README.
- [ ] Handlers registrados en `events.py` del módulo consumidor.
- [ ] `lint-imports` pasa localmente.
- [ ] Unit tests + al menos 1 integration test.
- [ ] Endpoints bajo `/api/v1/`, autenticados y tenant-scoped.
- [ ] Feature flag configurado si es user-facing durante freeze.
- [ ] Checklist de ADR-007 (zero-downtime) respondida.
```

---

## Ejemplo real de referencia

El módulo `platform` ya sigue este template — inspecciona
[`backend/app/modules/platform/`](../backend/app/modules/platform/)
como muestra viva.
