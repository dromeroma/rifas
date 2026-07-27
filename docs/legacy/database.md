# Base de datos

## Diagrama entidad-relación (resumido)

```
users ───< seller_assignments >─── raffles ───< prizes
   │                                  │
   │                                  ├──< tickets ───< ticket_numbers
   │                                  │       │
   │                                  │       └──< reservations
   ├──< commissions >─── payments ────┘       │
   │                       │                  │
   └─── audit_logs ────────┘                  │
                                              │
customers ────────────────────────────────────┘
```

## Tabla por tabla

### users
`id, email (UQ), full_name, password_hash, role(enum), phone, is_active, default_commission, timestamps`

### raffles
`id, name, description, total_tickets, numbers_per_ticket, number_min, number_max, number_digits, ticket_price, seller_commission, final_draw_date, status(enum), numbers_generated, numbers_generated_at, numbers_seed, logo_url, primary_color, timestamps`

Reglas:
- `(number_max - number_min + 1) == total_tickets * numbers_per_ticket`
- Tras `numbers_generated = true` la rifa es inmutable en sus campos matemáticos.

### prizes
`id, raffle_id (FK), position, name, description, estimated_value, draw_date, image_url, winning_number, winning_ticket_id`

### tickets
`id, raffle_id (FK), number_label, code (UQ por raffle), qr_payload, status(enum), version, seller_id (FK), customer_id (FK), timestamps`

Constraints:
- `UNIQUE(raffle_id, code)`
- `UNIQUE(raffle_id, number_label)`

### ticket_numbers
`id, raffle_id (FK), ticket_id (FK), number, position`

Constraints:
- `UNIQUE(raffle_id, number)` — **antifraude núcleo**.
- `position` ∈ [1..numbers_per_ticket].

### customers
`id, full_name, document, phone, email, city, timestamps`

### seller_assignments
`id, raffle_id (FK), seller_id (FK), from_ticket, to_ticket, returned_at, status, note`

### reservations
`id, ticket_id (FK), seller_id (FK), customer_id (FK nullable), expires_at, is_active, released_at, release_reason`

### payments
`id, ticket_id (FK), customer_id (FK), seller_id (FK nullable), method(enum), amount, reference, proof_url, notes, status(enum), confirmed_by (FK users), confirmed_at, rejection_reason`

### commissions
`id, seller_id (FK), raffle_id (FK), ticket_id (FK), payment_id (FK), amount, status, paid`

### audit_logs
`id, actor_id (FK users), action, entity_type, entity_id, description, metadata_json(jsonb), ip_address, user_agent, created_at`

### notifications
`id, user_id (FK), customer_id (FK), channel, title, body, read, sent`

## Índices recomendados

```sql
CREATE INDEX ix_tickets_raffle_status ON tickets (raffle_id, status);
CREATE INDEX ix_reservations_active_expires ON reservations (is_active, expires_at);
CREATE INDEX ix_audit_action_created ON audit_logs (action, created_at DESC);
CREATE INDEX ix_payments_status ON payments (status, created_at DESC);
```

## Migraciones

```bash
docker compose exec backend alembic revision --autogenerate -m "init schema"
docker compose exec backend alembic upgrade head
```
