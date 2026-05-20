# Arquitectura

## Capas

```
┌──────────────────────────────────────────────────────────┐
│                       FRONTEND (Angular 21)              │
│  features → core services → HTTP interceptor (JWT)       │
└──────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌──────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                   │
│  routers → services → repositories → SQLAlchemy ORM      │
│              ▲                          ▲                │
│              │                          │                │
│        Pydantic DTOs               AuditService          │
└──────────────────────────────────────────────────────────┘
        │                                  │
        ▼                                  ▼
┌──────────────┐                  ┌──────────────────────┐
│  PostgreSQL  │                  │   Redis (cache/cola) │
│              │                  │   reservas, rate-lim │
└──────────────┘                  └──────────────────────┘
```

## Principios

1. **Backend autoritativo.** Toda regla de negocio se valida en el servidor.
2. **Inmutabilidad de números.** Una vez generada la rifa, ni el super admin puede tocar `ticket_numbers`.
3. **Trazabilidad obligatoria.** Cada acción sensible inserta una fila en `audit_logs`.
4. **Transacciones atómicas** en operaciones críticas (reservar, confirmar pago, generar números).
5. **Sin secretos en cliente.** El frontend sólo recibe lo necesario.

## Servicios independientes

- `backend` — API REST
- `worker` — APScheduler / loop async para expirar reservas y enviar notificaciones
- `db` — PostgreSQL con backups programados
- `redis` — locks distribuidos y cache de sesiones

## Manejo de concurrencia

- `SELECT ... FOR UPDATE` al reservar / liberar boletas.
- `version` (columna entera) en `tickets` para bloqueo optimista.
- `UNIQUE(raffle_id, number)` evita doble inserción a nivel SQL.

## Errores de dominio

`app/core/exceptions.py` define excepciones de dominio mapeadas a códigos HTTP en `main.py`:

| Excepción                  | HTTP |
|----------------------------|------|
| `ImmutableRaffleError`     | 409  |
| `ReservationLockedError`   | 423  |
| `TicketUnavailableError`   | 409  |
| `DomainError` (base)       | 400  |
