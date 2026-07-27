# ADR-003 · Multi-tenant con shared DB y `tenant_id` en cada tabla

- **Estado**: Proposed
- **Fecha**: 2026-07-26
- **Relacionado con**: [`03-ARCHITECTURE.md`](../03-ARCHITECTURE.md)

## Contexto

Savvy Perks es multi-tenant desde el diseño. Cada empresa que usa el producto es un `Tenant` con sus rifas, clientes, reglas, campañas y wallets aislados de los demás.

Existen tres modelos posibles: shared DB con `tenant_id`, schema-per-tenant, o DB-per-tenant. Cada uno tiene trade-offs distintos en aislamiento, operación, costo y flexibilidad.

## Decisión

Usar **shared DB** con `tenant_id NOT NULL` en cada tabla de dominio:

- Toda tabla nueva lleva `tenant_id` obligatorio.
- Toda query filtra por `tenant_id` a través del `TenantScope` del request.
- Índices compuestos siempre con `tenant_id` como primera columna.
- `SUPER_ADMIN` puede cruzar tenants, con `audit_log` obligatorio en cada query cross-tenant.
- Row-level security de Postgres queda como opción de defensa en profundidad, no obligatoria en MVP.

Para un tenant Enterprise que exija aislamiento físico, tenemos plan de salida: extraer ese tenant a schema o BD dedicada con la misma app corriendo — sin cambios de código, solo config de conexión por tenant.

## Consecuencias

### Positivas

- Una migración cubre todos los tenants — no hay N schemas que actualizar.
- Un solo pool de conexiones, un solo backup, una sola instancia de observabilidad.
- Cross-tenant queries (para analytics del SaaS mismo, para AI training cross-tenant con opt-in) son triviales — un `WHERE` menos.
- Costos de infraestructura bajos hasta miles de tenants.

### Negativas

- Un tenant grande puede impactar el rendimiento de otros ("noisy neighbor"). Mitigación: monitoreo por `tenant_id`, límites por request, throttling automático.
- Riesgo de fuga cross-tenant si el filtro se olvida. Mitigación: `TenantScope` como dependencia de FastAPI obligatoria; tests de integración específicos.
- Enterprise puede exigir aislamiento físico por compliance. Cubierto con el plan de salida a schema/DB dedicada.

## Alternativas consideradas

**A. Schema-per-tenant** (Postgres schemas).
Rechazado. Requiere migraciones N veces. Query cross-tenant compleja. Cierta protección extra a costo alto de operación.

**B. DB-per-tenant** (una BD por tenant).
Rechazado a esta escala. Costo lineal en infraestructura. Ideal para Enterprise puntual, no como default.

**C. Shared DB con Row-Level Security como enforcement primario.**
Rechazado como default. RLS es defensa en profundidad, no reemplaza filtros a nivel app (que son más rápidos y depurables). Se puede activar como capa extra en V2.

**D. Shared DB con `tenant_id` filtered en app (elegido).**
Balance correcto entre simplicidad, escala razonable y camino de salida para casos Enterprise.

## Aprobación

- [ ] Founder
