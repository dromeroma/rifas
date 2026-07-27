# ADR-002 · Event bus interno con outbox pattern + Postgres LISTEN/NOTIFY

- **Estado**: Proposed
- **Fecha**: 2026-07-26
- **Relacionado con**: [`04-EVENTS.md`](../04-EVENTS.md), [ADR-001](ADR-001-modular-monolith.md)

## Contexto

El diseño de Perks es **event-driven**: acciones de dominio emiten eventos, otros módulos reaccionan. Es la base del Rules Engine, Campaigns, Notifications, Analytics y AI.

Necesitamos un mecanismo de bus interno que:
1. Garantice atomicidad (evento emitido si y solo si la transacción hace commit).
2. Preserve orden por agregado.
3. Soporte reintentos y dead-letter.
4. Sea observable en SQL.
5. No agregue nueva infraestructura antes de tiempo.

## Decisión

Implementar el bus con **outbox pattern** sobre Postgres:

1. Cada emisor escribe a la tabla `event_outbox` **en la misma transacción** del cambio de estado.
2. Un **dispatcher** consume `event_outbox` en orden y ejecuta handlers registrados en proceso.
3. `pg_notify('new_event')` avisa al dispatcher para evitar polling.
4. Cada handler registra su ejecución en `event_handled(event_id, handler_id, status, attempts)` — garantía de idempotencia por (evento, handler).
5. Reintentos con backoff exponencial. Dead letter tras N intentos.
6. La interfaz pública del bus es `bus.publish(event)` y `@bus.on(event_name)`.

## Consecuencias

### Positivas

- Cero infraestructura nueva. Postgres ya está.
- Atomicidad garantizada por la transacción SQL.
- Auditable con `SELECT` — cualquier dev entiende qué pasó.
- Bajo costo operativo, cero tiempo de aprendizaje.

### Negativas

- El throughput queda limitado a lo que Postgres pueda procesar en la tabla outbox (miles de eventos/s son manejables; decenas de miles no).
- Handlers en proceso comparten la salud del proceso — un handler bloqueado afecta a los demás (mitigado con timeouts obligatorios).
- Multi-worker requiere coordinar el consumo (mitigado con `SELECT ... FOR UPDATE SKIP LOCKED`).

### Camino a Kafka / Redis Streams

Cuando el throughput lo exija, la interfaz `bus.publish` gana un backend alternativo. Los handlers no cambian. Criterios objetivos para migrar:

- Throughput sostenido > 500 eventos/s por >1 semana, o
- Necesidad de retención mayor de la que soporta Postgres de forma eficiente, o
- Requerimiento de streaming a consumidores externos con backpressure.

## Alternativas consideradas

**A. Bus in-memory (pub/sub Python en proceso).**
Rechazado. Sin persistencia = eventos perdidos ante crash. Sin atomicidad = inconsistencia con la BD.

**B. Kafka / RabbitMQ / Redis Streams desde el inicio.**
Rechazado. Un servicio más para operar, con curva de aprendizaje real. No aporta valor a este volumen. Se reserva para el escenario de escala.

**C. Sidecar tipo Debezium leyendo el WAL.**
Rechazado. Complejo, requiere Docker aparte, curva de aprendizaje.

**D. Outbox pattern (elegido).**
Balance entre garantías y simplicidad. Camino claro a mayor escala.

## Aprobación

- [ ] Founder
