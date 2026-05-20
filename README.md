# Sistema Profesional de Gestión de Rifas

Plataforma web profesional para administrar rifas con transparencia, trazabilidad, control antifraude y automatización.

---

## 1. Visión general

| Capa | Tecnología |
|------|-----------|
| Frontend | Angular 21 (standalone components + signals) |
| UI Kit | Angular Material + componentes propios |
| Backend API | Python 3.12 + FastAPI |
| ORM | SQLAlchemy 2.x (async) |
| Migraciones | Alembic |
| Base de datos | PostgreSQL 16 |
| Auth | JWT (access + refresh) |
| PDF | ReportLab |
| QR | qrcode + Pillow |
| Cache / colas | Redis (reservas, rate limit, expiraciones) |
| Despliegue | Docker + docker-compose |
| Tests | pytest, Jest |
| Documentación API | OpenAPI / Swagger automática |

---

## 2. Estructura del repositorio

```
sistema-rifas/
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── security.md
│   └── roadmap.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── security.py
│   │   │   ├── deps.py
│   │   │   └── exceptions.py
│   │   ├── models/         # SQLAlchemy ORM
│   │   ├── schemas/        # Pydantic DTOs
│   │   ├── repositories/   # Acceso a datos
│   │   ├── services/       # Lógica de negocio
│   │   ├── routers/        # Endpoints REST
│   │   └── utils/
│   └── tests/
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── angular.json
    ├── tsconfig.json
    └── src/
        ├── index.html
        ├── main.ts
        ├── styles.scss
        ├── environments/
        └── app/
            ├── app.config.ts
            ├── app.routes.ts
            ├── app.component.ts
            ├── core/        # services, guards, interceptors, models
            ├── shared/      # componentes reutilizables (boleta, QR, etc.)
            ├── layouts/
            └── features/
                ├── auth/
                ├── admin/
                ├── seller/
                └── customer/
```

---

## 3. Modelo de datos (resumen)

### Entidades principales

- **users** — usuarios del sistema (super_admin, admin, vendedor)
- **roles** — catálogo de roles
- **raffles** — rifas configurables (nombre, fecha, precios, estado)
- **prizes** — premios por rifa (TV, bonos, etc.) con fecha de juego propia
- **tickets** — boletas (1 boleta = 20 números)
- **ticket_numbers** — números individuales asociados a una boleta (UNIQUE por rifa)
- **customers** — clientes finales
- **seller_assignments** — bloques de boletas asignados a vendedores
- **reservations** — reservas activas con expiración
- **payments** — pagos y comprobantes (Nequi, Daviplata, etc.)
- **commissions** — comisiones del vendedor por boleta pagada
- **audit_logs** — auditoría total (quién, qué, cuándo, IP, dispositivo)
- **notifications** — notificaciones automáticas

### Restricciones críticas

```sql
-- Un número nunca puede repetirse dentro de la misma rifa
ALTER TABLE ticket_numbers
  ADD CONSTRAINT uq_raffle_number UNIQUE (raffle_id, number);

-- Una boleta tiene exactamente N números (validado a nivel servicio)
-- Una boleta no puede estar reservada dos veces simultáneamente
ALTER TABLE tickets
  ADD CONSTRAINT uq_raffle_ticket_code UNIQUE (raffle_id, code);
```

Ver `docs/database.md` para el DER completo.

---

## 4. Algoritmo de generación de números (inmutable)

Requisitos:

1. Generar todos los números `0000`–`9999`
2. Mezclarlos con `secrets.SystemRandom().shuffle` (CSPRNG)
3. Distribuir secuencialmente en bloques de 20 entre 500 boletas
4. Insertar en una transacción ATOMIC
5. Marcar la rifa como `numbers_generated=true`
6. A partir de ese momento, **bloquear cualquier mutación** sobre `ticket_numbers`

Implementación: [backend/app/services/number_generator.py](backend/app/services/number_generator.py).

Protecciones:

- `UNIQUE(raffle_id, number)` a nivel SQL
- Trigger / regla aplicada en `services` que rechaza UPDATE/DELETE si `raffle.numbers_generated = true`
- Auditoría obligatoria del evento de generación

---

## 5. Roles y permisos

| Rol | Crear rifa | Generar números | Asignar boletas | Confirmar pago | Reservar | Ver auditoría | Ver finanzas |
|-----|:----------:|:---------------:|:---------------:|:--------------:|:--------:|:-------------:|:------------:|
| super_admin | ✓ | ✓ (una sola vez) | ✓ | ✓ | — | ✓ | ✓ |
| admin       | — | — | ✓ | ✓ | — | ✓ (limitado) | ✓ |
| vendedor    | — | — | — | — | ✓ | — | sólo sus comisiones |
| cliente     | — | — | — | — | — | — | — |

Nadie puede modificar números una vez generada la rifa.

---

## 6. Endpoints REST principales

```
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

# Rifas
GET    /raffles
POST   /raffles                       (super_admin)
GET    /raffles/{id}
PATCH  /raffles/{id}                  (super_admin, sólo si !numbers_generated)
POST   /raffles/{id}/generate-numbers (super_admin, una sola vez)
POST   /raffles/{id}/prizes           (super_admin)

# Boletas
GET    /raffles/{id}/tickets
GET    /tickets/{id}
GET    /tickets/{id}/pdf
GET    /tickets/{id}/qr
POST   /tickets/{id}/reserve          (vendedor)
DELETE /tickets/{id}/reserve          (vendedor / sistema)

# Asignaciones
POST   /sellers/{id}/assign           (admin/super_admin)
POST   /sellers/{id}/return           (admin)

# Pagos
POST   /payments                      (vendedor o cliente)
POST   /payments/{id}/confirm         (admin/super_admin)
POST   /payments/{id}/reject          (admin/super_admin)

# Clientes
POST   /customers
GET    /customers/{id}/tickets

# Verificación pública (sin auth)
GET    /verify/{code}                 (datos NO sensibles)

# Auditoría
GET    /audit-logs                    (admin/super_admin)

# Reportes
GET    /reports/sales
GET    /reports/commissions
GET    /reports/financial
```

Documentación interactiva en `/docs` (Swagger) y `/redoc`.

---

## 7. Flujo operativo

1. Super admin crea la rifa con premios (TV 50", 3 bonos de $200.000) y fechas.
2. Super admin ejecuta **"Generar números"** — operación irreversible.
3. Admin asigna bloques de boletas a vendedores (001–020, 021–040, ...).
4. Vendedor reserva boleta para un cliente. Temporizador 24h.
5. Cliente paga directamente a la cuenta del negocio (Nequi/Daviplata/Banco/QR).
6. Cliente o vendedor sube comprobante.
7. Admin confirma pago. La boleta pasa a `PAGADA`. Se genera comisión.
8. Cliente recibe PDF + QR de su boleta.
9. Día del sorteo: se registra el número ganador y se notifica al ganador.

Restricciones:

- En los últimos 7 días antes de cada premio, no se permiten reservas.
- Las reservas expiradas vuelven a `disponible` automáticamente (worker Redis).

---

## 8. Seguridad

- JWT con `access_token` (15 min) + `refresh_token` (7 días, rotación).
- Hash de contraseñas con `bcrypt` (cost 12).
- CORS configurado por entorno.
- Rate limiting por IP en endpoints sensibles (login, reservar, pagar).
- Validación estricta con Pydantic en cada endpoint.
- Restricciones a nivel SQL (UNIQUE, CHECK, FK con ON DELETE RESTRICT).
- Transacciones SERIALIZABLE en operaciones críticas (reservar, confirmar pago).
- Bloqueo optimista con columna `version` en `tickets`.
- Auditoría con IP, user-agent, payload diff.
- Política de contraseñas y bloqueo tras N intentos fallidos.
- Comprobantes almacenados con nombre hasheado, fuera de la raíz pública.

Ver `docs/security.md` para el detalle.

---

## 9. Frontend (Angular 21)

Módulos principales:

- **auth** — login, recuperación de contraseña
- **admin** — dashboard, rifas, premios, vendedores, pagos, auditoría, reportes
- **seller** — mis boletas, reservar, registrar cliente, comisiones
- **customer** — verificación pública por QR / código

Componentes clave reutilizables:

- `<app-ticket-design>` — boleta vertical con cancha de fútbol y 20 números (10 por mitad)
- `<app-qr-viewer>` — visualizador de QR
- `<app-countdown>` — temporizador de reserva
- `<app-payment-upload>` — subir comprobante con validación

Estado:

- Servicios con `signals` y `computed`
- HTTP `withFetch` + interceptor JWT + refresh automático
- Guards por rol

---

## 10. Diseño de boleta — Cancha de fútbol

Layout vertical (formato A6 para impresión, responsive en pantalla):

```
┌──────────────────────────────────┐
│  RIFA DEL TELEVISOR 50"          │  ← header
│  Sorteo: 2026-09-15  Boleta 001  │
├──────────────────────────────────┤
│                                  │
│   ── Mitad superior (10) ──      │
│        [9999]                    │  arquero virtual
│   [...] [...] [...]              │  defensas
│   [...] [...] [...] [...]        │  medios
│   [...] [...] [...]              │  delanteros
│                                  │
│   ── Línea de medio campo ──     │
│                                  │
│   [...] [...] [...]              │  delanteros
│   [...] [...] [...] [...]        │  medios
│   [...] [...] [...]              │  defensas
│        [0001]                    │  arquero virtual
│   ── Mitad inferior (10) ──      │
│                                  │
├──────────────────────────────────┤
│  [ QR ]   Premios:               │
│           • TV 50" – 2026-09-15  │
│           • Bono $200k – ...     │
│  Código: 7Z3-4K9-PLM             │
└──────────────────────────────────┘
```

Nota: aunque la consigna pide "sin porteros", el diseño usa 10 posiciones por mitad. Se elimina la figura del árbitro y del portero como roles; las 10 posiciones son: 3 defensas + 4 medios + 3 delanteros por mitad (esquema 3-4-3). Total 20 números.

Componente: [frontend/src/app/shared/components/ticket-design/ticket-design.component.ts](frontend/src/app/shared/components/ticket-design/ticket-design.component.ts).

---

## 11. Despliegue

`docker-compose.yml` orquesta:

- `db` — PostgreSQL 16
- `redis` — colas + cache
- `backend` — FastAPI + uvicorn
- `frontend` — Angular build servido por nginx
- `worker` — expiración de reservas y tareas programadas (APScheduler)

Variables de entorno en `.env` (ver `.env.example`).

Comandos:

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.cli seed
```

---

## 12. Roadmap

### MVP (fase 1)

- [x] Modelo de datos + migraciones
- [x] Auth JWT + roles
- [x] CRUD de rifas y premios
- [x] Generación inmutable de números
- [x] Asignación de boletas a vendedores
- [x] Reservas con expiración
- [x] Carga de comprobantes y confirmación de pago
- [x] PDF + QR de boleta
- [x] Panel vendedor y panel admin
- [x] Verificación pública por QR
- [x] Auditoría base

### Fase 2

- Notificaciones por WhatsApp/Email
- Reportes financieros avanzados y exportación Excel
- Multi-rifa simultánea
- App móvil para vendedores (PWA)

### Fase 3

- Multi-tenant (varias organizaciones)
- Sorteo en vivo con transmisión
- Integración con pasarelas de pago (Wompi, ePayco)
- Marketplace de rifas

---

## 13. Primera rifa configurada

- **Nombre:** Gran Rifa del Televisor
- **Boletas:** 500
- **Números por boleta:** 20
- **Rango:** 0000–9999
- **Precio boleta:** $20.000 COP
- **Comisión vendedor:** $3.000 COP por boleta pagada
- **Premios:**
  | # | Premio | Fecha de juego |
  |---|--------|----------------|
  | 1 | Bono $200.000 COP | (parametrizable) |
  | 2 | Bono $200.000 COP | (parametrizable) |
  | 3 | Bono $200.000 COP | (parametrizable) |
  | 4 | Televisor 50" | (parametrizable, fecha final) |

Se configuran al crear la rifa en el panel admin.

---

## 14. Cómo iniciar

### Base de datos

La DB vive en **Supabase** (proyecto `Loterias`, ref `amzdwbzwspqzirratgcx`). Variables clave en `.env`:

- `DATABASE_URL` → Transaction pooler (`:6543`) — usado por FastAPI en runtime.
- `ALEMBIC_DATABASE_URL` → Direct connection (`db.<REF>.supabase.co:5432`) — usado por Alembic.

### Desarrollo local con venv (Windows)

```powershell
# Crear ambiente virtual e instalar dependencias
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Migraciones (apunta a Supabase vía ALEMBIC_DATABASE_URL)
python -m alembic upgrade head

# Crear usuario admin
python -m app.cli create-superadmin

# Cargar la rifa del televisor + 3 bonos
python -m app.cli seed-tv-raffle

# Levantar API
uvicorn app.main:app --reload
```

### Frontend

```powershell
cd frontend
npm install
npm start
```

### Despliegue con docker-compose

```bash
docker compose up -d --build
# (la DB la pone Supabase, sólo se orquestan redis + backend + worker + frontend)
```

URLs:
- Frontend: http://localhost:4200
- API: http://localhost:8000/docs
- Verificación pública: http://localhost:4200/verify/{code}
