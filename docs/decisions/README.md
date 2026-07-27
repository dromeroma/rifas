# ADRs — Architecture Decision Records

Registro cronológico y numerado de decisiones arquitectónicas relevantes.

Formato: cada ADR es un `.md` con `ADR-<3-digit>-<slug>.md`.

Estados posibles:
- **Proposed** — está en discusión.
- **Accepted** — aprobado, vigente.
- **Superseded by ADR-XXX** — reemplazado por otra decisión posterior.
- **Deprecated** — ya no aplica, sin reemplazo directo.

Formato estándar por archivo:
1. Título + ID.
2. Estado y fecha.
3. Contexto.
4. Decisión.
5. Consecuencias (positivas y negativas).
6. Alternativas consideradas.

## Índice

| ID | Título | Estado |
|----|--------|--------|
| ADR-001 | Modular monolith (no microservicios) | Proposed |
| ADR-002 | Event bus interno con outbox + LISTEN/NOTIFY | Proposed |
| ADR-003 | Shared DB multi-tenant con `tenant_id` en cada tabla | Proposed |
| ADR-004 | DSL JSON propio para Rules Engine (vs motor externo) | Proposed |
| ADR-005 | Rename del repo GitHub `rifas` → `savvy-perks` | Proposed |
| ADR-006 | Migración de Boletera a módulo `raffles/` con freeze hasta 4-ago-2026 | Proposed |

Cada ADR "Proposed" queda pendiente de firma del founder antes de pasar a "Accepted".
