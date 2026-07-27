# ADR-004 · DSL JSON propio para Rules Engine (vs motor externo)

- **Estado**: Accepted
- **Fecha**: 2026-07-26
- **Firmado por**: Deimer Romero (founder) — 2026-07-26
- **Relacionado con**: [`05-RULES_ENGINE.md`](../05-RULES_ENGINE.md)

## Contexto

El Rules Engine es la infraestructura central del producto: traduce "cuando pase X, haz Y" a comportamiento del sistema. Es el feature diferenciador que los tenants configuran a diario.

Existen múltiples caminos: usar motor externo (Temporal, Camunda, n8n embebido, cel-spec) o construir un DSL propio embebido en el producto.

## Decisión

Construir un **DSL JSON propio** con motor embebido en el backend:

- Estructura: `trigger` + `conditions` + `actions`.
- Predicados con `all`/`any`/`not` y operadores acotados (`eq`, `gte`, `in`, `within_last_days`, etc.).
- `actions` como catálogo cerrado registrado en `ActionRegistry`, extensible solo por PR.
- Expresiones aritméticas parseadas por mini-parser, sandbox — sin `eval`.
- Versiones inmutables (`RuleVersion`).
- Modo `dry_run` obligatorio en UI.
- Trazabilidad completa (`RuleExecution` por evaluación).

Editor visual (drag-drop) queda diferido a V2. MVP sale con UI de formularios + biblioteca de plantillas.

## Consecuencias

### Positivas

- **Alineado con el dominio**: los verbos del DSL (`credit_points`, `issue_voucher`, `enroll`) son verbos del negocio, no primitivas genéricas.
- **UX controlada**: no hay tab de "editor de flows" abstracto; se siente parte del producto.
- **Sin dependencia externa** con curva de aprendizaje o costo.
- **Import/export de plantillas** entre tenants es trivial (JSON puro).
- **Sandboxing** total: nunca ejecutamos código arbitrario del tenant.

### Negativas

- Hay que construirlo. Estimación: 3–4 semanas de un dev senior para MVP funcional (motor + UI de formularios + 15 plantillas).
- Cada `action` nueva requiere PR — puede sentirse limitante para power users. Mitigación: `webhook.call` como action permite integrar sistemas externos sin PR.
- Debugging del motor es responsabilidad del equipo. Mitigación: `dry_run`, logs por regla, panel de últimas ejecuciones.

## Alternativas consideradas

**A. Temporal / Cadence.**
Rechazado. Sobredimensionado para el caso (Temporal es para workflows durables complejos, no para "si compra, dar puntos"). Requiere infraestructura adicional.

**B. Camunda / Bonita (BPMN).**
Rechazado. Modelo de procesos empresariales, hostil para el admin de una pizzería.

**C. n8n embebido.**
Rechazado. Excelente como producto standalone, mala fit como componente. Da al tenant una UI ajena, integración forzada.

**D. cel-spec / OPA (policy languages).**
Rechazado como interfaz de usuario final. Puede usarse como capa interna si aparece necesidad, pero el DSL de fachada debe ser humano.

**E. DSL JSON propio (elegido).**
Coste inicial mayor, control total, alineación con producto, camino claro a editor visual encima del mismo JSON.

## Aprobación

- [x] Founder — 2026-07-26
