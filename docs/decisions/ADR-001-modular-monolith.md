# ADR-001 · Modular monolith (no microservicios)

- **Estado**: Accepted
- **Fecha**: 2026-07-26
- **Firmado por**: Deimer Romero (founder) — 2026-07-26
- **Relacionado con**: [`03-ARCHITECTURE.md`](../03-ARCHITECTURE.md)

## Contexto

Savvy Perks evoluciona desde el proyecto Boletera hacia una plataforma multi-módulo (Customer, Wallet, Rewards, Rules, Campaigns, Notifications, AI, Raffles, y N adapters).

Existe la tentación —fuerte en 2026 con el hype AI/agent-mesh— de arrancar con microservicios. Es un patrón atractivo pero mal aplicado a startups pequeñas.

Team size actual: 1–3 devs. Volumen actual: cientos de eventos/día.

## Decisión

Construir Savvy Perks como **modular monolith**:

- **Un repo, un deploy** del backend FastAPI.
- Módulos de dominio bien acotados (`identity`, `customer`, `wallet`, `rewards`, `rules`, `campaigns`, `notifications`, `analytics`, `ai`, `raffles`, `adapters/*`, `platform`).
- Reglas de importación entre módulos enforceadas en CI (`import-linter`).
- Comunicación entre módulos via **eventos** cuando cruza contexto, via **interfaces de servicio** cuando es un llamado interno controlado.
- Preparado para extraer cualquier módulo como servicio independiente el día que la evidencia lo justifique.

## Consecuencias

### Positivas

- Un solo pipeline de deploy, un solo pool de conexiones, una sola instancia de observabilidad.
- Cambios cross-module son un solo PR, no una coreografía de despliegues.
- Barrera de entrada baja para devs nuevos.
- Debugging local trivial.
- Costos de infraestructura bajos hasta cientos de miles de MRR.

### Negativas

- Un despliegue del módulo `analytics` reinicia toda la app.
- Riesgo de que las reglas de dependencia se erosionen si el equipo no las cuida (mitigado con CI).
- Si un módulo tiene un memory leak, tumba todo (mitigado con límites de proceso y observabilidad).

### Compromiso a futuro

Establecemos criterios objetivos para extraer un módulo como servicio:

1. Un módulo específico sostiene >10x el tráfico del promedio.
2. Requiere ciclo de deploy distinto (crítico vs experimental).
3. Requiere stack tecnológico distinto por razón de dominio (ej. AI Engine con Python + GPU).
4. Un equipo dedicado >2 devs full-time trabaja solo en él.

Sin al menos dos de estos, no se extrae.

## Alternativas consideradas

**A. Microservicios desde el inicio.**
Rechazado. Team size no lo justifica; multiplica costo operativo (colas, service mesh, observabilidad distribuida, sagas). Alarga time-to-market en 2–3x sin beneficio de rendimiento a esta escala.

**B. Monolito no modular (Django tradicional / FastAPI plano).**
Rechazado. Sin límites explícitos entre contextos, el código se enreda y el día de extraer un servicio requiere refactor destructivo.

**C. Modular monolith con boundaries laxos.**
Rechazado. Sin CI que verifique importaciones, las reglas se degradan en meses.

**D. Modular monolith con CI enforcement (elegido).**
Balance correcto entre simplicidad operativa y disciplina arquitectónica.

## Aprobación

- [x] Founder — 2026-07-26
- [ ] Tech lead (cuando se una)
