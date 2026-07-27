# ADR-007 · Zero-downtime durante la transformación a Savvy Perks

- **Estado**: Accepted
- **Fecha**: 2026-07-26
- **Firmado por**: Deimer Romero (founder) — 2026-07-26
- **Relacionado con**: [ADR-006](ADR-006-raffles-como-modulo.md), [`09-ROADMAP.md`](../09-ROADMAP.md)

## Contexto

La transformación de Boletera → Savvy Perks pasa por varias fases: refactor arquitectónico, nuevos módulos, migración de tablas, cambio de identidad visual, y publicación de un sitio comercial premium.

Existe **una restricción no-negociable**: los clientes actuales de rifas (empezando por Rifas El Golazo, con sorteos entre 1-4-agosto-2026) **no pueden ver ni una sola interrupción** durante el proceso. Ni caída, ni comportamiento raro, ni performance degradada, ni pérdida de datos, ni cambio visual inesperado.

Sin una regla explícita y verificable, es fácil que un refactor "aparentemente inofensivo" toque un flujo activo y rompa una venta real.

## Decisión

Adoptamos una **estrategia de zero-downtime de 6 principios**, aplicable a cada PR desde ahora hasta el cutover final.

### 1. Freeze operativo de Boletera hasta cierre de sorteos

- Ventana de freeze: **desde ya hasta el 2026-08-05 00:00 hora Colombia** (día después del sorteo final).
- Durante el freeze **solo entran a `main`**:
  - Bug fixes de severidad alta que afecten la operación del sorteo (aprobación founder).
  - Ajustes de datos vía scripts controlados (documentados).
  - Cambios de infraestructura reversibles y probados en staging (Cloudflare rules, DNS, env vars).
- **No** entran a `main`: features nuevas, refactors estructurales, cambios de UI/UX, migraciones de esquema no aditivas.
- Toda la Fase 1 del rediseño ocurre en `feat/savvy-perks-transformation` sin merges a `main`.

### 2. Migraciones aditivas y reversibles obligatorias

Reglas de migración durante todo el proceso:

- **Solo aditivas**: `ADD COLUMN`, `ADD INDEX CONCURRENTLY`, `CREATE TABLE`, `CREATE TYPE`.
- **Nunca en la misma migración**: agregar columna Y renombrar/eliminar otra.
- Columnas nuevas siempre **nullable** o con **default constante** — sin backfills bloqueantes.
- Eliminación de columnas: mínimo **dos releases separados** — primero deprecar (dejar de escribir), después eliminar en release posterior.
- Índices siempre con `CREATE INDEX CONCURRENTLY` para no bloquear la tabla.
- Cada migración incluye `downgrade()` que efectivamente revierte.

Todo esto se verifica en CI antes de merge.

### 3. Feature flags para todo cambio user-facing durante la transición

- Cada nuevo endpoint, cada cambio de UI, cada nueva funcionalidad va detrás de un flag DB-based con scope `(tenant_id, flag_name)`.
- Default `off`. Se activa progresivamente por tenant, empezando por el propio del founder.
- Flags con caducidad: cada flag documenta cuándo pasa a "on por default" o se retira.

Esto permite que el código esté en producción **compilado y corriendo** mucho antes de que ningún cliente lo vea.

### 4. Rutas y URLs públicas inmutables durante la transición

Estas rutas están **congeladas** hasta cutover final y no pueden cambiar comportamiento observable:

- `GET /verify/:code` — QRs impresos ya circulan, tienen que seguir funcionando.
- `GET /v/:code` (backend) — endpoint corto usado por Cloudflare Worker.
- `GET /rifa/:id/comprar` — landing público de compra usado por vendedores.
- `POST /public/raffles/:id/checkout` — endpoint del flujo de compra.
- `POST /public/raffles/:id/manual-transfer` — subida de comprobante.
- `POST /public/reservations/schedule-payment` — programar pago.
- Todas las rutas del panel de admin actuales (`/admin/…`).

Cambios internos (implementación) son libres. Cambios de contrato requieren nueva versión de path (`/api/v2/…`) coexistiendo con la vieja.

### 5. Blue/green a nivel código para el módulo `raffles/`

Cuando refactorizamos el código de Boletera al módulo `raffles/`, seguimos este patrón:

1. Escribimos el nuevo código en `modules/raffles/` en paralelo al viejo (en la rama del rediseño).
2. Los endpoints del código nuevo se registran, pero detrás de flag `off`.
3. Con flag `on`, tanto código viejo como nuevo procesan cada request en paralelo (shadow mode) — el viejo es la respuesta al cliente; el nuevo se compara pero no responde.
4. Métricas de divergencia se monitorean durante N días.
5. Cuando cero divergencia sostenida, se hace `switch` — el nuevo responde, el viejo se queda como fallback.
6. Después de dos releases estables, se elimina el viejo.

Este patrón se aplica al primer módulo que refactoricemos (probablemente `identity` y `customer`) para probar la mecánica, y después a `raffles` cuando llegue su turno.

### 6. Observabilidad reforzada durante la ventana

Antes de tocar el módulo de rifas, dejamos:

- Alertas en errores 5xx del flujo de compra (>1% durante 5 min → alerta).
- Alertas en latencia p99 (>3s durante 5 min → alerta).
- Health checks del endpoint `/verify/:code` cada 60s desde Cloudflare.
- Métrica de "reservas activas" vs baseline — caída súbita se marca.
- Log estructurado con `tenant_id` en cada request para diagnóstico rápido.

Nada de esto es nuevo — es aplicar lo que ya está mejor. Sí requiere revisión de dashboards antes del primer PR de refactor.

## Consecuencias

### Positivas

- Cliente actual invisible a la transformación.
- Riesgo de rollback limitado a "revertir un flag" — no "revertir 200 commits".
- Cada dev sabe qué puede y qué no puede tocar sin preguntar.
- Auditoría clara: cada PR pasa por la checklist.

### Negativas

- Velocidad de desarrollo en `main` cae durante ~2 semanas (freeze). Contrarrestado con velocidad total en `feat/savvy-perks-transformation`.
- Feature flags acumulan deuda si nadie los retira. Mitigación: cada flag con fecha de retiro obligatoria en su registro.
- Shadow mode duplica temporalmente carga en el backend. Mitigación: solo se activa por tenant específico durante ventana corta.

## Checklist obligatoria para cada PR durante la transición

Todo PR que toque `backend/`, `frontend/`, o infraestructura durante la ventana de freeze debe declararlo:

- [ ] ¿Este PR modifica una ruta pública listada en el punto 4? — Si sí, requiere ADR.
- [ ] ¿Este PR incluye migración? — Si sí, ¿es aditiva y reversible? ¿tiene `downgrade()`?
- [ ] ¿Este PR cambia comportamiento user-facing? — Si sí, ¿está detrás de flag?
- [ ] ¿Este PR toca `modules/raffles/`? — Si sí, ¿tiene tests que cubren los flujos actuales?
- [ ] ¿Este PR se puede rollbackear en <5 minutos si algo falla en producción? — Si no, no se merge.

Si alguna respuesta es "no" para las relevantes, el PR se bloquea.

## Alternativas consideradas

**A. Refactorizar en `main` con feature flags globales.**
Rechazado. Aunque los flags aíslan el comportamiento, el riesgo de que un refactor toque un helper compartido y afecte al código viejo es real. Freeze de `main` durante ventana crítica elimina esa clase entera de riesgos.

**B. Congelar todo el desarrollo hasta el 5-ago.**
Rechazado. Innecesario — la rama del rediseño puede avanzar en paralelo sin tocar producción.

**C. Cutover big-bang el 5-ago.**
Rechazado. Un cutover completo el mismo día implica probar todo en un solo evento. Preferimos cutover incremental por módulo con flags.

**D. Zero-downtime documentado con 6 principios (elegido).**
Costoso en disciplina, seguro para el cliente.

## Aprobación

- [x] Founder — 2026-07-26
