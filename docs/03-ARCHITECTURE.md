# 03 · Arquitectura

Cómo se construye Savvy Perks. Decisiones fundacionales, layout físico y lógico, límites de módulos, y política de crecimiento.

Guía de lectura: lo importante no es la lista de tecnologías —esa está fija—, sino **por qué** cada pieza está donde está y **cuándo** cambiaría.

---

## Cinco decisiones fundacionales

### AD-1 · Modular monolith, no microservicios

Un solo repositorio, un solo deploy del backend, un solo deploy del frontend. Boundaries por módulo son estrictos: cada módulo tiene su propio esquema conceptual y no importa código de otros módulos directamente — solo su API pública o eventos.

**Por qué**:
- Team size actual: 1–3 devs. Microservicios exigen 10+.
- La complejidad de un monolito bien modularizado escala hasta millones de requests/mes.
- El costo de coordinar despliegues, colas y observabilidad de N servicios mata la velocidad hasta que hay evidencia de que un servicio se debe partir.
- Nada nos impide extraer un módulo el día que duela.

**Cuándo lo revisitamos**: cuando un módulo específico (probablemente Notifications o Analytics) tenga carga distinta al resto y merezca escalado independiente.

Ver [`decisions/ADR-001-modular-monolith.md`](decisions/ADR-001-modular-monolith.md).

### AD-2 · Event bus interno con outbox pattern + Postgres LISTEN/NOTIFY

**Problema**: necesitamos que cada acción de dominio emita eventos que otros módulos escuchen. No queremos Kafka/RabbitMQ todavía —eso son 3 servicios adicionales que operar—.

**Solución MVP**:
1. Cada emisor escribe el evento a la tabla `event_outbox` **en la misma transacción** del cambio de estado.
2. Un dispatcher (worker) consume `event_outbox` en orden y despacha a los handlers registrados en proceso.
3. Los handlers son funciones Python asíncronas que se suscriben por nombre de evento.
4. `pg_notify` avisa al dispatcher cuando hay eventos nuevos (sin polling constante).

**Ventajas**:
- Atomicidad: si la transacción hace commit, el evento existe; si hace rollback, nunca existió.
- Sin infraestructura adicional (Postgres ya está).
- Reintentos, dead letter y observabilidad viven en Postgres — auditables por SQL.

**Camino a Kafka**: cuando el throughput lo exija, el mismo dispatcher gana un backend "kafka" y los handlers migran sin cambiar código. La abstracción es `bus.publish(event)` / `@bus.on(event_name)`.

Ver [`04-EVENTS.md`](04-EVENTS.md).

### AD-3 · Multi-tenant con shared DB + `tenant_id` en cada tabla

**Por qué shared DB (no schema-per-tenant, no DB-per-tenant)**:
- Simplicidad operacional (una migración, un backup, un connection pool).
- Cross-tenant queries triviales para analytics del SaaS.
- Row-level security en Postgres si algún día lo necesitamos.

**Reglas**:
- Toda tabla de dominio lleva `tenant_id NOT NULL`.
- Toda query filtra por `tenant_id` a través del `TenantScope` del request.
- Un `SUPER_ADMIN` puede cruzar tenants pero cada consulta cross-tenant queda auditada.
- Índices siempre con `tenant_id` como primera columna del índice compuesto.

**Cuándo cambiamos**: cuando un cliente enterprise exija aislamiento físico. Ahí sale ese tenant a schema/DB dedicada con la misma app — cero cambios de código.

### AD-4 · API-first y contratos versionados

Todo endpoint público vive en `/api/v1/…` (agregamos versión al path). OpenAPI generado automáticamente desde FastAPI. Cada versión de API es estable — cambios rompedores exigen `v2`, cohabitando con `v1` durante ventana de deprecación.

**Superficies expuestas**:
- **REST API pública** — para integraciones de tenants y para el frontend propio.
- **Webhooks salientes** — entregamos eventos suscritos a URLs del tenant.
- **Widgets embebibles** — snippets JS que renderizan wallet, ofertas, retos en sitios del tenant.
- **SDKs oficiales** (V2): JS/TS, Python, PHP.

### AD-5 · Un modelo de identidad único: Savvy Identity

**Autenticación de admins/members** (staff del tenant): flujo OAuth-like propio, JWT firmado, refresh tokens, magic links. Se llama **Savvy Identity**.

**Autenticación de customers** (cliente final): magic link por email/WhatsApp, sesión ligada al tenant. Sin passwords.

**Escenario cross-producto**: cuando el mismo humano usa Savvy POS y Savvy Perks, un solo login. JWKS público expuesto por Savvy Identity; cada producto valida con la misma clave.

**Escenario cross-tenant**: opt-in del customer para conectar sus perfiles ante Savvy Identity → habilita Consumer Wallet.

---

## Vista lógica (módulos)

```
apps/
├── api/                       # backend FastAPI (deploy único a Render)
│   ├── modules/
│   │   ├── identity/          # Members, Tenants, Auth
│   │   ├── customer/          # Customer + Identity + Profile + Consent
│   │   ├── wallet/            # Balances, ledger, vouchers
│   │   ├── rewards/           # Catálogo + Redemptions + Inventory
│   │   ├── gamification/      # Levels, Badges, Challenges, Streaks
│   │   ├── rules/             # Rules Engine
│   │   ├── campaigns/         # Segments, Campaigns, Journeys
│   │   ├── notifications/     # Templates + Delivery + Providers
│   │   ├── analytics/         # Views y agregaciones
│   │   ├── ai/                # RFM, churn scoring, recomendaciones
│   │   ├── raffles/           # ← Boletera migrada como módulo
│   │   ├── adapters/          # POS-adapter, Water-adapter, etc.
│   │   └── platform/          # bus, outbox, audit, jobs, tenancy
│   ├── main.py                # ensamblado + middleware + routers
│   ├── alembic/               # migraciones
│   └── tests/
│
├── web/                       # frontend Angular (deploy a Cloudflare)
│   ├── src/app/
│   │   ├── shared/            # design system, tokens, primitives
│   │   ├── layout/            # shell del admin
│   │   ├── features/
│   │   │   ├── customers/
│   │   │   ├── wallets/
│   │   │   ├── rewards/
│   │   │   ├── rules/
│   │   │   ├── campaigns/
│   │   │   ├── gamification/
│   │   │   ├── insights/
│   │   │   ├── raffles/       # ← módulo vertical
│   │   │   └── settings/
│   │   └── core/              # services, auth, http, config
│   └── ...
│
└── worker/                    # (V2) worker separado para dispatcher/jobs
                                 mismo repo, mismo build, otro entry point
```

**Reglas de dependencia** entre módulos del backend:
- `platform` puede ser importado por todos (bus, tenancy, audit son transversales).
- `identity`, `customer` son leaf modules — no importan de otros.
- `wallet`, `rewards`, `gamification` pueden importar `customer` (por su `id`) pero no entre sí — se comunican por eventos.
- `rules`, `campaigns` orquestan: pueden importar cualquier acción de otros módulos pero solo a través de una interfaz declarada (`ActionRegistry`).
- `adapters/*` son fronteras externas — hablan al mundo (POS, Shopify, etc.) y emiten eventos internos.

**Enforcement**: reglas de importación se verifican en CI con `import-linter` (Python) — si un módulo importa algo prohibido, el build falla.

---

## Vista física (despliegue)

```
                    ┌──────────────┐
                    │   Cliente    │
                    │ (browser/app)│
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Cloudflare  │  DNS + CDN + WAF + Workers
                    │  perks.       │  (frontend estático + edge routing)
                    │  savvytrix.  │
                    │  com         │
                    └──────┬───────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
      ┌──────▼──────┐ ┌────▼─────┐ ┌────▼──────┐
      │  Static     │ │ API v1   │ │  /verify  │
      │  Assets     │ │ (proxy)  │ │  proxy    │
      │  (SPA)      │ │          │ │  al back  │
      └─────────────┘ └────┬─────┘ └────┬──────┘
                           │            │
                    ┌──────▼────────────▼──────┐
                    │        Render            │
                    │   FastAPI (api web svc)  │
                    │   Worker (dispatcher)    │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │      Supabase Postgres   │
                    │   (Pooler + Direct)      │
                    └──────────────────────────┘

                    ┌──────────────────────────┐
                    │      Supabase Storage    │
                    │   (comprobantes, logos)  │
                    └──────────────────────────┘

  Servicios de terceros consumidos:
  · Wompi / Mercado Pago (payments)
  · Provider WhatsApp Business
  · Provider Email transaccional
  · Provider SMS
  · Push (FCM / APNs)
```

**Notas de despliegue**:
- Frontend en Cloudflare Workers with Static Assets (ya configurado en `wrangler.jsonc`).
- Backend en Render (web service). Alembic corre en start.
- **Nuevo**: worker separado en Render (mismo repo, otro service) para dispatcher + jobs recurrentes. En MVP se puede correr como thread del web service; se separa cuando la carga lo pida.

---

## Convenciones fundamentales

### Naming (código Python)
- Módulos: `snake_case`.
- Modelos SQLAlchemy: `PascalCase`, tabla `snake_case_plural`.
- Eventos: `snake_case` con formato `<context>.<entity>.<action>` en pasado — `customer.identified`, `wallet.points.credited`, `raffle.ticket.paid`.
- IDs de recursos: `<prefix>_<ulid>` — `cus_01H...`, `rwd_01H...`, `rul_01H...`. Los ULIDs son sortables y no filtran cardinalidad como los enteros.

### Idempotencia
- Endpoints mutantes aceptan `Idempotency-Key` en header.
- Handlers de eventos son idempotentes por `(event_id, handler_id)`.
- Webhooks salientes se reintentan con exponential backoff hasta 24h.

### Errores
- Formato de error consistente: `{ code, message, details, request_id }`.
- `code` es enum estable, no cambia entre versiones sin ADR.

### Auditoría
- Cada mutación crítica emite un evento de dominio Y registra en `audit_log`.
- `audit_log` es append-only, retención mínima 2 años.

### Observabilidad
- Logs estructurados (JSON) con `request_id`, `tenant_id`, `member_id`, `customer_id`.
- Trazas correladas por `request_id` end-to-end (frontend → backend → workers).
- Métricas Prometheus expuestas por `/metrics` (V2).

---

## Seguridad — capas

1. **Perímetro** — Cloudflare (WAF, rate limit, bot mitigation).
2. **App** — Auth obligatorio salvo endpoints públicos explícitos, RBAC por rol, tenant scoping en cada query, CSRF donde aplique.
3. **Datos** — cifrado en reposo (Postgres nativo + campos PII con `pgcrypto` para `document`, `phone` cuando corresponda), TLS obligatorio en tránsito, secretos en env vars.
4. **Operacional** — least privilege en credenciales, rotación, sin secretos en logs, `audit_log` de accesos SUPER_ADMIN.
5. **Cumplimiento** — Habeas Data (Ley 1581 Colombia): consents versionados, derecho al olvido implementado, exportación de datos.

---

## Escalabilidad — dónde nos pega primero y qué hacemos

| Cuello previsto | Umbral aproximado | Mitigación |
|---|---|---|
| Latencia N+1 en customer views | ~10k customers/tenant | Índices compuestos + selectinload agresivo |
| Ledger de wallet crece infinito | ~10M transactions | Particionamiento por `tenant_id` + rollups mensuales |
| Dispatcher secuencial de eventos | ~100 eventos/s | Sharding por `tenant_id` en el worker |
| Eventos que reactivan reglas | reglas mal escritas → loop | Detección de ciclos + kill-switch por tenant |
| Notifications throughput | volumen alto de campañas | Cola dedicada (Redis) + concurrencia por canal |
| Storage de comprobantes | crece por PDF/fotos | Politica de retención + CDN de Supabase |

Todos son **problemas del éxito**. Cada uno tiene mitigación clara sin refactor grande.

---

## 🚦 A validar contigo

### A1 · Worker separado desde MVP o después

**Recomendación**: dispatcher corre como task del mismo proceso FastAPI en MVP; se separa a servicio Render aparte cuando el volumen o los deploys largos molesten. Diferencia: **1 servicio Render vs 2**. Costo: ~$7/mes extra.

### A2 · Feature flags

**Necesitamos** algún sistema para features en beta y rollout por tenant. Opciones:
- **DB-based flags** (una tabla, admin UI). Simple, sin dependencia externa. ✨ *recomendado.*
- Servicio SaaS (LaunchDarkly, PostHog). Potente, cuesta.

### A3 · Renombre del repo GitHub

**Recomendación**: `dromeroma/rifas` → `dromeroma/savvy-perks`. Redirects automáticos preservan URLs viejas. CI y Render pueden requerir 1 ajuste en el webhook. ¿Autorizas cuando estemos listos?

### A4 · Renombre del proyecto Cloudflare

Actualmente Worker `perks` (bien). ¿Renombramos el servicio Render `rifas-nehd` a `savvy-perks-api`? Requiere migrar dominio del servicio (breaking para links viejos si algún QR físico apunta a Render directo). Recomendación: **dejarlo así por ahora**, migramos cuando quememos QRs actuales.
