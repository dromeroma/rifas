# 06 · Rewards Engine & Wallet

Dos módulos que viven juntos: **Rewards** es el catálogo y las mecánicas de canje; **Wallet** es dónde reposa el valor del customer. Se documentan juntos porque no se entienden separados.

---

## Wallet — modelo

Una wallet por `(customer_id, tenant_id)`. Contenidos:

### Balances

Múltiples tipos coexisten. Cada tipo tiene: unidad, permite decimales o no, expiración por defecto, si permite negativo.

Catálogo inicial de tipos (extensible por tenant):

| Tipo | Unidad | Ejemplo de uso |
|---|---|---|
| `points` | entero | Puntos genéricos |
| `cashback_cop` | decimal 2 | Cashback en pesos |
| `xp` | entero | Experiencia de gamificación (no canjeable) |
| `credit_seconds` | entero | Segundos de internet gratis (ISP) |
| `visits` | entero | Contadores de visita (gym, café) |
| `stamps` | entero | Sellos tipo tarjeta de café |

Un tenant define en su catálogo qué tipos usa y con qué reglas.

### Ledger

Toda mutación de balance pasa por el ledger — nunca se hace `UPDATE balance = balance + N` directo. La tabla:

```
wallet_ledger
├── id                 bigserial
├── wallet_id          uuid/int
├── balance_type       text
├── delta              numeric(18,4)   -- positivo o negativo
├── balance_after      numeric(18,4)   -- snapshot post
├── cause              enum(rule, campaign, redemption, manual, expiration, refund, adjustment)
├── cause_id           text (id de la regla/campaña/etc)
├── related_event_id   text
├── memo               text
├── created_at         timestamptz
├── expires_at         timestamptz   -- si aplica al lote
└── tenant_id          int
```

El balance actual = `SUM(delta)`. Se materializa como columna en `wallet_balance` con trigger para lecturas rápidas, pero la fuente de verdad es el ledger.

### Vouchers

Cupones vivientes en la wallet. Cada uno referencia una definición (Reward tipo COUPON) y guarda:

- `code` (único por tenant),
- `state` (`issued`, `active`, `redeemed`, `expired`, `revoked`),
- `expires_at`,
- `conditions_snapshot` (para congelar reglas en el momento de emisión — evita cambios que dañen redenciones),
- `origin` (regla, campaña, canje manual).

### Badges y Streaks

- `wallet_badges` — badges obtenidos, con `awarded_at` y `origin`.
- `wallet_streaks` — rachas activas y última verificación.

Ambos son estado, no consumen unidades del ledger — pero pueden desbloquear acciones.

---

## Reward — el catálogo

Una `Reward` es la definición de "algo que el tenant ofrece a sus customers".

Campos esenciales:

```
reward
├── id                  rwd_ULID
├── tenant_id
├── name
├── description
├── kind                enum(POINTS, COUPON, CASHBACK, GIFT_CARD, PRODUCT, SERVICE,
│                            RAFFLE_TICKET, CONNECTIVITY_CREDIT, EXPERIENCE, EXTERNAL)
├── image_url
├── kind_config         jsonb  -- parámetros específicos del kind
├── cost                jsonb  -- { balance_type: "points", amount: 500 }  o gratis
├── eligibility         jsonb  -- reglas (tier, segmento, tags, geo, horario)
├── inventory           jsonb  -- { total: 100, per_customer_lifetime: 1 } o null (ilimitado)
├── validity            jsonb  -- { starts_at, ends_at, expires_after_days }
├── delivery            jsonb  -- how it's delivered: instant, code, physical_pickup, webhook
├── partner_id          fk?    -- si es reward de un partner (marketplace)
├── state               enum(draft, published, paused, archived)
├── version             int
└── created_at
```

`kind_config` según tipo:

- `COUPON`: `{ discount_type: "percent"|"amount"|"free_shipping", value, applies_to, code_pattern }`
- `POINTS`: `{ amount }`
- `CASHBACK`: `{ amount, currency }`
- `GIFT_CARD`: `{ face_value, provider, terms_url }`
- `PRODUCT/SERVICE`: `{ sku, pickup_location, description }`
- `RAFFLE_TICKET`: `{ raffle_id, ticket_count }` — genera boletas en el módulo Raffles
- `CONNECTIVITY_CREDIT`: `{ seconds_or_gb, plan_id }`
- `EXPERIENCE`: `{ booking_url, capacity, dates }`
- `EXTERNAL`: `{ partner_ref, callback_url }`

---

## Redemption — el acto de canjear

Proceso completo:

```
1. Customer solicita canje (UI/API/regla).
2. Rewards Engine:
   a. Verifica elegibilidad (tier, segmento, geo, horario, límites por customer).
   b. Verifica inventory (con lock optimista o pesimista).
   c. Verifica balance suficiente en el tipo requerido.
3. Genera Redemption(id, state=pending).
4. Debita wallet en la misma transacción (delta negativo con cause=redemption).
5. Ejecuta entrega:
   - COUPON: genera code único, se muestra al customer.
   - RAFFLE_TICKET: llama módulo Raffles → asigna boleta.
   - EXTERNAL: llama webhook del partner.
   - PRODUCT/SERVICE: notifica al staff del tenant para preparar.
6. Emite `rewards.redemption.completed` o `rewards.redemption.failed` (rollback wallet).
7. Notifica al customer.
```

Reglas críticas:

- **Atómica**: débito + reserva de inventory + creación de Redemption son una transacción.
- **Reversible**: si la entrega externa falla, el débito se revierte (nuevo asiento en ledger con `cause=refund`).
- **Auditada**: cada Redemption guarda snapshot de la Reward al momento — inmune a cambios posteriores del catálogo.

---

## Elegibilidad — DSL corto

Reutiliza el mismo lenguaje del Rules Engine (predicados). Ejemplo:

```json
{
  "all": [
    { "path": "customer.tier", "op": "in", "value": ["silver", "gold"] },
    { "path": "customer.total_spend_cop", "op": "gte", "value": 100000 },
    { "path": "now.day_of_week", "op": "in", "value": ["saturday", "sunday"] }
  ]
}
```

Ventaja de reusar el DSL: mismos operadores, mismas primitivas, misma UX de edición.

---

## Inventarios y stock

Tres modelos coexisten:

1. **Ilimitado** — puntos, cashback, cupones digitales con código-por-canje.
2. **Stock global** — "solo 100 gift cards de $50k".
3. **Stock por customer** — "1 vez en la vida", "1 vez al mes".

Implementación:
- Cada `Reward` tiene `inventory_state` con contadores actuales.
- Reserva optimista (versioning) al iniciar canje.
- Un cron reconcilia por si algo se desincronizó.

---

## Cupones — códigos

Estrategias:

- **Código único por canje**: generado al momento, entregado al customer (`AB12-3CDE-4F56`).
- **Código compartido** (menos común): todos los canjes usan el mismo (útil para promos masivas — riesgo de abuso alto, no default).
- **Códigos importados**: el tenant sube CSV de códigos preexistentes (gift cards de un partner). Cada canje consume uno.

---

## Gift Cards — cómo funcionan

Dos escenarios:

1. **Emitidas por el propio tenant**: son cupones especiales con `face_value` en pesos, canjeables en el POS del tenant (integración vía POS-adapter).
2. **De terceros**: partners con API (ejemplo: Rappi, Éxito, Falabella). Consumen inventario propio, el partner cobra al tenant.

Ambas viven como `Reward.kind=GIFT_CARD`.

---

## Rifas como Reward

`Reward.kind=RAFFLE_TICKET` no crea la boleta directamente — llama al módulo Raffles vía su API pública:

```
raffles.grant_ticket({
  tenant_id, customer_id, raffle_id, ticket_count, origin=redemption
})
```

Raffles decide cómo asigna la boleta (número aleatorio, del pool, etc.) y emite `raffle.ticket.granted`. Perks solo se preocupa por el débito y la trazabilidad.

Esta separación es clave: Raffles sigue siendo un módulo con sus reglas propias — el pool general, comisiones, sorteos. Perks solo la ve como "otro tipo de reward".

---

## Marketplace de Perks (V3)

Visión: un catálogo global donde tenants pueden **ofrecer sus rewards a customers de otros tenants** — un Café ofrece un descuento a los customers de un ISP; a cambio recibe una comisión o un cross-marketing.

Requisitos técnicos:
- `Reward` gana `is_public` y `commission_terms`.
- Consumer Wallet (V2/V3) es prerrequisito — sin identidad cross-tenant no hay marketplace.
- Rating y moderación de partners.
- Contabilidad de settlements entre tenants.

Este es un producto entero. En roadmap V3 — se documenta aparte cuando toque.

---

## Anti-abuso

Los sistemas de perks son objetivos favoritos del fraude. Salvaguardas desde MVP:

- **Idempotencia estricta**: dos requests con el mismo `Idempotency-Key` producen una sola redemption.
- **Rate limits**: por customer, por tenant, por IP.
- **Device fingerprinting** (V2): mismo device intentando canjear como N customers = flag.
- **Velocity checks**: patrones anómalos (`10 canjes en 60s`) disparan quarantine.
- **Reversibilidad**: cualquier canje puede revertirse por admin con audit trail.
- **Detección de colusión** (V2/AI): grafos de customers que solo interactúan entre sí para farmear puntos.

---

## APIs — superficies

Reward Engine expone:

- `POST /api/v1/rewards` — crear reward
- `GET /api/v1/rewards` — listar catálogo (filtros: kind, state, segment)
- `POST /api/v1/rewards/{id}/publish` — publicar
- `POST /api/v1/redemptions` — solicitar canje (customer o admin en su nombre)
- `GET /api/v1/customers/{id}/wallet` — snapshot completo
- `GET /api/v1/customers/{id}/wallet/ledger` — historial
- `POST /api/v1/wallets/{id}/adjust` — ajuste manual (admin, auditado)

Todo con OpenAPI, autenticación, tenant scope.

---

## 🚦 A validar contigo

### W1 · ¿Puntos y cashback como tipos separados o "monedas" en un catálogo genérico?

- **Opción A**: hardcodear `points`, `cashback_cop`, `xp` como tipos conocidos.
- **Opción B** ✨: catálogo `wallet_balance_type` — cada tenant define sus tipos con reglas propias (nombre, unidad, expiración, canjeable a qué).

Recomendación B — el ISP quiere `credit_seconds`, el gym quiere `visits`, la peluquería quiere `stamps`. Rígido es hostil.

### W2 · Expiración de puntos

**Preguntas**:
- ¿Default por tenant o por lote?
- ¿Notificamos 7 días antes?

**Recomendación**: default configurable por tenant + override por regla/lote + notificación a 7 días antes (regla del sistema, opcional).

### W3 · Retiros de cashback

Si un customer acumula `cashback_cop`, ¿cómo lo saca?
- **Nequi / Daviplata payout** (API disponibles, KYC del cliente requerido).
- **Descuento en próxima compra** (más simple, no requiere KYC).
- Ambos.

**Recomendación**: MVP con "descuento en próxima compra". Payouts reales en V2 cuando entendamos volumen y compliance.

### W4 · Marketplace

**¿Es visión o backlog?** Si es visión, todo el diseño de `Reward` debe soportar `is_public`, `commission`, `partner_id` desde ya. Si es backlog, lo agregamos cuando toque.

Recomendación: **diseñar los campos desde ya** (barato), pero **no implementar** hasta V3.
