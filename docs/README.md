# Savvy Perks — Documentación

Documentos fundacionales del producto. Se leen en orden.

| # | Documento | Propósito |
|---|-----------|-----------|
| 00 | [Visión](00-VISION.md) | Qué ES y qué NO es Savvy Perks |
| 01 | [Principios](01-PRINCIPLES.md) | Reglas de decisión del producto |
| 02 | [Dominio](02-DOMAIN.md) | Bounded contexts, entidades, lenguaje ubicuo |
| 03 | [Arquitectura](03-ARCHITECTURE.md) | Cómo se construye y por qué |
| 04 | [Eventos](04-EVENTS.md) | Catálogo canónico + convenciones |
| 05 | [Rules Engine](05-RULES_ENGINE.md) | DSL de reglas |
| 06 | [Rewards Engine](06-REWARDS_ENGINE.md) | Recompensas y wallet |
| 07 | [Gamification](07-GAMIFICATION.md) | Puntos, niveles, logros, retos |
| 08 | [AI](08-AI.md) | Roadmap de inteligencia aplicada |
| 09 | [Roadmap](09-ROADMAP.md) | MVP → V2 → Enterprise |
| 10 | [UI Guidelines](10-UI_GUIDELINES.md) | Sistema visual y de motion |
| 11 | [Sitio Comercial](11-COMMERCIAL_SITE.md) | Rediseño premium de savvyperks.com |

Anexos:
- [`CLAUDE.md`](CLAUDE.md) — instrucciones específicas para Claude Code en este repo.
- [`decisions/`](decisions/) — ADRs (Architecture Decision Records) numerados.
- [`legacy/`](legacy/) — docs de la etapa "Boletera" (rifas); se preservan como referencia histórica, no rigen el nuevo diseño.

---

## Estado del proceso

Este set de docs corresponde a la **Fase 0 — Comprensión y arquitectura**. Ninguna línea de código nueva se escribe hasta que:

1. Todo doc con sección **🚦 A validar** tenga decisiones cerradas.
2. Los ADRs iniciales estén aprobados.
3. El roadmap MVP esté firmado.

**Decisiones fundacionales cerradas** (2026-07-26):
- ✅ Foco comercial MVP: 3 verticales (restaurantes/gimnasios/rifas). Arquitectura horizontal.
- ✅ Consumer Wallet: V3 como producto independiente ("Savvy Wallet").
- ✅ Rename del repo GitHub `rifas` → `savvy-perks` al cierre de Fase 0.
- ✅ Freeze de Boletera hasta pasar sorteo del 4-ago-2026. Cutover el 5-ago.
- ✅ ADR-007: estrategia zero-downtime obligatoria durante toda la transformación.
- ✅ Sitio comercial premium en paralelo a Fase 1 del producto (Fase 0.5).

Los cuestionamientos que el equipo fundador le hace al founder están marcados con **🚦 A validar** o **⚠️ Riesgo**. No son bloqueos — son puntos donde el founder debe decidir con contexto.

---

## Cómo aportar a los docs

- Cambios de contenido → PR contra `feat/savvy-perks-transformation`.
- Cambios de decisión arquitectónica → nuevo ADR en `decisions/`, referenciado desde el doc afectado.
- Actualizaciones de estado → editar la tabla en este README.
