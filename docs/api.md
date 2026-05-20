# API Reference (resumen)

Documentación interactiva en `/docs` (Swagger) y `/redoc`.

## Auth

### POST `/auth/login`
```json
{ "email": "admin@rifa.co", "password": "..." }
```
Respuesta: `TokenPair { access_token, refresh_token }`.

### POST `/auth/refresh`
```json
{ "refresh_token": "..." }
```

### GET `/auth/me`
Requiere Bearer. Devuelve el `User` autenticado.

---

## Rifas (super_admin)

### POST `/raffles`
```json
{
  "name": "Gran Rifa del Televisor",
  "total_tickets": 500,
  "numbers_per_ticket": 20,
  "number_min": 0,
  "number_max": 9999,
  "number_digits": 4,
  "ticket_price": 20000,
  "seller_commission": 3000,
  "final_draw_date": "2026-09-15",
  "prizes": [
    { "position": 1, "name": "Bono $200.000", "draw_date": "2026-07-21", "estimated_value": 200000 },
    { "position": 2, "name": "Bono $200.000", "draw_date": "2026-08-04", "estimated_value": 200000 },
    { "position": 3, "name": "Bono $200.000", "draw_date": "2026-08-18", "estimated_value": 200000 },
    { "position": 4, "name": "Televisor 50''", "draw_date": "2026-09-15", "estimated_value": 1800000 }
  ]
}
```

### POST `/raffles/{id}/generate-numbers`
Genera los 10.000 números y los reparte entre las 500 boletas.
**Operación irreversible.** Sólo `super_admin`.

### GET `/raffles/{id}`
Devuelve la rifa con sus premios.

---

## Boletas

### GET `/raffles/{id}/tickets`
Lista de boletas (sin números).

### GET `/tickets/{id}`
Boleta detallada con sus 20 números.

### POST `/tickets/{id}/reserve`
```json
{ "customer_id": 42 }
```
Reserva por 24h. Falla si está en ventana bloqueada (`423 Locked`) o si no está disponible (`409`).

### GET `/tickets/{id}/qr`
PNG.

### GET `/tickets/{id}/pdf`
PDF A6 vertical con cancha de fútbol.

---

## Verificación pública

### GET `/verify/{code}`
Sin auth. Sólo datos públicos:

```json
{
  "valid": true,
  "raffle": { "name": "...", "final_draw_date": "..." },
  "ticket": {
    "label": "012", "code": "7Z3-4K9-PLM",
    "is_paid": true, "is_winner": false,
    "numbers": ["0421", "...."]
  },
  "prizes": [...]
}
```

---

## Códigos HTTP de dominio

| Código | Significado |
|--------|-------------|
| 401 | No autenticado |
| 403 | Rol insuficiente |
| 409 | Conflicto de estado (boleta no disponible, rifa inmutable) |
| 423 | Ventana de reservas cerrada |
| 422 | Datos inválidos (Pydantic) |
