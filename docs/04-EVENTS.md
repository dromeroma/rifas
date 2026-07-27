# 04 · Eventos

El sistema nervioso de Savvy Perks. Todo lo importante que ocurre en el dominio genera un evento; todos los módulos relevantes reaccionan a eventos.

Este documento define: envelope estándar, convenciones de nombres, catálogo canónico, y qué NO es un evento.

---

## Qué es un evento

Un **evento de dominio** es un **hecho de negocio** que ya ocurrió — nombre en pasado, inmutable, con actor y timestamp.

- ✅ `customer.identified`
- ✅ `wallet.points.credited`
- ✅ `raffle.ticket.paid`
- ❌ `customer.identify` (imperativo — eso es un comando, no un evento)
- ❌ `wallet.updated` (demasiado genérico — no dice qué pasó)

**Regla**: si al leer el nombre el equipo no puede reaccionar de forma clara, el nombre es malo.

---

## Envelope estándar

Cada evento en el sistema tiene esta estructura:

```json
{
  "id": "evt_01H7X3Y8QK2N9M4B5V6C7D8E9F",
  "type": "wallet.points.credited",
  "version": 1,
  "occurred_at": "2026-07-26T14:32:11.412Z",
  "tenant_id": 42,
  "actor": {
    "kind": "system" | "member" | "customer" | "rule" | "campaign",
    "id": 123,
    "on_behalf_of": null
  },
  "subject": {
    "kind": "customer" | "wallet" | "reward" | "ticket" | "campaign" | ...,
    "id": "cus_01H..."
  },
  "context": {
    "request_id": "req_...",
    "session_id": "sess_...",
    "trigger_event_id": "evt_..."
  },
  "data": { ... },
  "idempotency_key": "auto-derivada o explícita"
}
```

Campos garantizados por el bus:
- `id` — ULID único (sortable por tiempo).
- `type` — nombre canónico del evento.
- `version` — schema version del `data`. Se sube al hacer breaking change.
- `occurred_at` — timestamp del hecho (no de la publicación).
- `tenant_id` — obligatorio salvo eventos de plataforma (`platform.*`).
- `actor` — quién causó el evento.
- `subject` — sobre quién trata.
- `context.trigger_event_id` — si este evento fue emitido por un handler de otro, guardamos la cadena para detectar loops.
- `data` — payload específico del tipo (documentado por evento).
- `idempotency_key` — para deduplicación en handlers.

---

## Convención de nombres

Formato: `<context>.<entity>.<action>`

- `<context>` — bounded context o módulo raíz (`customer`, `wallet`, `rewards`, `rules`, `campaign`, `raffle`, `pos`, ...).
- `<entity>` — a veces igual al context; se agrega cuando el context tiene varias entidades (`wallet.points`, `wallet.voucher`).
- `<action>` — verbo en pasado (`credited`, `redeemed`, `expired`, `completed`, `failed`).

Ejemplos:
- `customer.identified`
- `customer.merged`
- `wallet.points.credited`
- `wallet.points.debited`
- `wallet.points.expired`
- `wallet.voucher.issued`
- `wallet.voucher.redeemed`
- `rewards.redemption.completed`
- `rules.rule.fired`
- `campaign.step.executed`
- `raffle.ticket.paid`
- `pos.sale.completed`

**Regla estricta**: nombres en `snake_case`. En pasado. Máximo tres niveles.

---

## Catálogo canónico (semilla)

Este es el catálogo inicial. Cada evento se documenta en su módulo (schema del `data`, actor típico, handlers esperados). Aquí solo la lista.

### Context: `platform`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `platform.tenant.created` | Tenant nuevo se aprovisiona | seed de configs, welcome email |
| `platform.tenant.suspended` | Facturación vencida u ops | pausar campañas activas |
| `platform.member.joined` | Nuevo staff en un tenant | audit + email onboarding |

### Context: `customer`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `customer.identified` | Un customer entra al sistema por primera vez | crear wallet, tier default |
| `customer.identity.added` | Se conecta una identidad nueva (ej. teléfono verificado) | dedup check |
| `customer.identity.verified` | OTP correcto sobre email/phone | subir score de confianza |
| `customer.profile.updated` | Cambian atributos base o custom | recalcular segmentos afectados |
| `customer.consent.granted` | Cliente autoriza canal | habilitar notifs |
| `customer.consent.revoked` | Cliente retira consent | detener notifs de ese canal |
| `customer.merged` | Merge de duplicados | reconciliar wallets y eventos |
| `customer.birthday.reached` | Regla temporal disparada por cron | reglas de cumpleaños |

### Context: `wallet`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `wallet.created` | Al crear customer | inicializar balances |
| `wallet.points.credited` | Sumar puntos | recalcular tier, notificar |
| `wallet.points.debited` | Restar puntos (redención, castigo, ajuste) | tier check |
| `wallet.points.expired` | Cron de expiración | notificar antes + al vencer |
| `wallet.cashback.credited` | Cashback ganado | notificar |
| `wallet.cashback.redeemed` | Retirado a medio de pago | integración con proveedor |
| `wallet.voucher.issued` | Cupón nuevo | notificar |
| `wallet.voucher.redeemed` | Cupón usado | métrica de campaña origen |
| `wallet.voucher.expired` | Cupón vencido | métricas |
| `wallet.balance.adjusted` | Ajuste manual admin | audit obligatorio |

### Context: `rewards`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `rewards.reward.published` | Nueva reward en catálogo | notificar segmentos elegibles |
| `rewards.reward.unpublished` | Se retira | cancelar redemptions pendientes |
| `rewards.redemption.requested` | Customer pide canjear | verificar elegibilidad y stock |
| `rewards.redemption.completed` | Canje exitoso | debitar wallet, entregar, notificar |
| `rewards.redemption.failed` | Falla en canje | revertir débito, notificar admin |
| `rewards.inventory.low` | Stock por debajo del umbral | alerta al admin |

### Context: `rules`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `rules.rule.fired` | Regla evaluó y ejecutó acciones | métrica, debug |
| `rules.rule.skipped` | Condiciones no pasaron | métrica |
| `rules.rule.errored` | Falló acción | alerta, retry, kill switch |

### Context: `campaign`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `campaign.launched` | Se activa | log, snapshot de segment |
| `campaign.customer.entered` | Un customer entra al journey | tracking |
| `campaign.step.executed` | Cada paso ejecutado | notificar canal |
| `campaign.customer.completed` | Termina el journey | métricas |
| `campaign.customer.exited` | Sale antes (opt-out o condición) | métricas |
| `campaign.finished` | Fin de vigencia | reporte final |

### Context: `gamification`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `gamification.xp.credited` | Se ganó XP | recalcular level |
| `gamification.level.up` | Sube de tier | reward automático, notificar |
| `gamification.badge.awarded` | Insignia ganada | notificar, publicar |
| `gamification.challenge.started` | Customer entra a reto | tracking |
| `gamification.challenge.completed` | Reto cumplido | premio |
| `gamification.challenge.failed` | Deadline sin cumplir | notificar suave |
| `gamification.streak.extended` | Racha continúa | reward incremental |
| `gamification.streak.broken` | Racha se rompe | mensaje motivacional |

### Context: `notifications`
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `notifications.message.queued` | En cola de envío | throttling |
| `notifications.message.sent` | Entregado al proveedor | tracking |
| `notifications.message.delivered` | Confirmación proveedor | métrica |
| `notifications.message.failed` | Falla persistente | log, alerta si masivo |
| `notifications.message.opened` | Email abierto / mensaje leído | métrica |
| `notifications.message.clicked` | CTA usado | atribución |

### Context: `raffle` (módulo vertical)
| Evento | Cuándo | Handlers típicos |
|---|---|---|
| `raffle.raffle.published` | Rifa pasa a activa | publicar en catálogo |
| `raffle.ticket.reserved` | Reserva creada | contribuye a threshold |
| `raffle.ticket.paid` | Pago confirmado | emitir wallet.points.credited (regla) |
| `raffle.ticket.expired` | Reserva vencida | liberar |
| `raffle.customer.won` | Sorteo ganado | notificación premium |
| `raffle.draw.executed` | Sorteo hecho | publicar ganadores |

### Contexts de adapters (verticales)
- `pos.sale.completed`, `pos.sale.refunded`, `pos.customer.linked`
- `water.subscription.paid`, `water.subscription.overdue`
- `ecommerce.order.paid`, `ecommerce.order.refunded`, `ecommerce.cart.abandoned`

Cada uno tiene schema documentado en el módulo adapter correspondiente.

---

## Qué NO es un evento

- **Consultas** (`customer.viewed`, `wallet.checked`) — son GETs, no eventos de dominio. Si necesitamos tracking de analytics, usamos un stream aparte (`analytics.*` en V2).
- **Cambios cosméticos** (`ui.button.clicked`) — pertenecen a un product analytics tool, no al bus interno.
- **Estados intermedios** (`payment.processing`) — solo los estados terminales califican (`payment.succeeded`, `payment.failed`).
- **Repeticiones sin significado** (`heartbeat`, `sync.tick`) — son telemetría, no eventos.

---

## Reglas para handlers

Un handler es una función suscrita a un tipo de evento. Reglas obligatorias:

**H1 · Idempotencia**
Cada handler debe soportar recibir el mismo evento N veces sin efectos duplicados. Se logra guardando `(event_id, handler_id)` en tabla `event_handled` y saltando si ya existe.

**H2 · Aislamiento**
Un handler no debe modificar estado de otro módulo directamente — llama a la API pública del módulo destino.

**H3 · Timeouts**
Ningún handler bloquea más de N segundos (configurable por handler). Si excede, se marca fallido y va a retry.

**H4 · Retries con backoff**
Cada handler declara política de retry: `max_attempts`, `backoff` (`exponential` o `linear`), `dead_letter_after`.

**H5 · Cadena de causalidad**
Si un handler emite eventos nuevos, propaga `context.trigger_event_id` al evento hijo. Detección de loops: si la cadena excede N eventos (default 20), se bloquea con alerta.

**H6 · No secretos en logs**
Payloads con PII se logan enmascarados (email → `d***@***.com`).

---

## Anatomía del outbox

Tabla `event_outbox`:

```
event_outbox
├── id                bigserial
├── event_id          text (ULID único)
├── type              text
├── version           int
├── tenant_id         int (nullable para platform.*)
├── occurred_at       timestamptz
├── actor             jsonb
├── subject           jsonb
├── context           jsonb
├── data              jsonb
├── idempotency_key   text
├── status            enum('pending','dispatched','failed')
├── attempts          int
├── last_error        text
├── dispatched_at     timestamptz
└── created_at        timestamptz
```

Tabla `event_handled`:

```
event_handled
├── event_id     text
├── handler_id   text
├── status       enum('success','failed','dead')
├── attempts     int
├── last_error   text
├── handled_at   timestamptz
PRIMARY KEY (event_id, handler_id)
```

Dispatcher:
1. `LISTEN new_event` (Postgres pg_notify).
2. Consume batch de `event_outbox WHERE status='pending' ORDER BY id LIMIT N`.
3. Para cada evento: itera handlers registrados, ejecuta con timeout, guarda resultado en `event_handled`.
4. Marca outbox como `dispatched`.
5. Retries: cron re-encola eventos con `event_handled.status='failed'` según política.

---

## 🚦 A validar contigo

### E1 · Retention del outbox

Los eventos se acumulan indefinidamente. Opciones:
- **A** Retener todo por siempre. Auditoría total. Storage crece.
- **B** Retener 90 días caliente + archive frío (S3/Storage). ✨ *recomendación*
- **C** Retener por SLA + purga automática.

### E2 · Analytics stream separado

¿Emitimos eventos de UX y comportamiento (impresiones, clicks) al mismo bus? **Recomendación**: NO. Bus interno = negocio. Analytics stream aparte va a un colector propio (o Segment/PostHog) — no contamina la lógica de reglas.

### E3 · Schema registry

¿Registramos schemas de eventos en algún lado? Opciones:
- Comentarios en código (simple, dispersos).
- Módulo `platform.events.schemas` con Pydantic models por evento ✨. Genera doc + validación runtime.

Recomendación: **B**, obliga a documentar y valida en publish/handle.
