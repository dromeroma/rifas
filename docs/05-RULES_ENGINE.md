# 05 · Rules Engine

El corazón operativo de Savvy Perks. Traduce **"cuando pase X, haz Y"** en configuración que el admin puede armar sin escribir código — pero con la potencia de un motor de reglas serio.

---

## Modelo mental

Una regla es una función pura sobre el mundo:

```
trigger  →  conditions  →  actions
```

- **Trigger**: qué evento la despierta. Un solo evento por regla (regla enfocada = regla depurable).
- **Conditions**: predicados sobre el evento y sobre el estado actual del customer/wallet/tenant. AND por defecto, con soporte a OR/NOT anidado.
- **Actions**: efectos concretos (dar puntos, mandar mensaje, otorgar cupón, agregar a segmento, entrar a campaña).

Todo lo demás son detalles.

---

## Estrategia: DSL JSON en V1, editor visual en V2

**V1 (MVP)**: reglas se guardan como JSON declarativo. Se editan desde una UI de formulario simple (dropdowns + campos) + preview del JSON para power users. Este JSON es la fuente de verdad — inmutable por versión.

**V2**: encima del JSON, un **editor visual drag-drop** (tipo Zapier/Make). El JSON no cambia — el editor solo lo produce.

**Por qué esta secuencia**:
- El editor visual es 80% del esfuerzo del feature. Salir con JSON UI simple valida el motor antes de invertir en el canvas.
- Cuando el motor está probado, el editor visual se prueba solo con snapshots.
- El JSON DSL sirve para **importar/exportar plantillas** entre tenants — imposible con solo UI.

---

## DSL — versión 1

```json
{
  "id": "rul_01H7...",
  "tenant_id": 42,
  "version": 3,
  "name": "Puntos por compra sobre 50.000",
  "description": "Cada compra confirmada sobre 50k COP da 1 punto por cada 1k gastado.",
  "enabled": true,
  "trigger": {
    "event": "pos.sale.completed"
  },
  "conditions": {
    "all": [
      { "path": "data.amount_cop", "op": "gte", "value": 50000 },
      { "path": "customer.tier", "op": "in", "value": ["bronze", "silver"] },
      {
        "any": [
          { "path": "data.channel", "op": "eq", "value": "in_store" },
          { "path": "data.channel", "op": "eq", "value": "app" }
        ]
      }
    ]
  },
  "actions": [
    {
      "type": "wallet.credit_points",
      "params": {
        "amount_expr": "floor(data.amount_cop / 1000)",
        "reason": "purchase_reward",
        "expires_in_days": 180
      }
    },
    {
      "type": "notifications.send",
      "params": {
        "channel": "whatsapp",
        "template": "purchase_points_earned",
        "vars": { "points": "{{action[0].result.credited}}" }
      }
    }
  ],
  "limits": {
    "per_customer_per_day": 5,
    "per_customer_per_month": 60,
    "global_per_day": 10000
  },
  "cooldown_seconds": 60
}
```

### Piezas del DSL

**`trigger.event`** — el nombre canónico del evento (ver [`04-EVENTS.md`](04-EVENTS.md)).

**`conditions`** — expresión booleana construida con:
- `all` (AND de N cláusulas)
- `any` (OR de N cláusulas)
- `not` (negación de 1 cláusula)
- **Predicado hoja**: `{ path, op, value }`

Anidamiento libre (`all` dentro de `any`, etc.).

**`path`** — expresión de acceso a datos del evento y del contexto:
- `data.*` → payload del evento
- `customer.*` → snapshot del customer al momento de evaluar
- `wallet.*` → snapshot de la wallet
- `tenant.*` → config del tenant
- `now.*` → tiempo (`now.iso`, `now.day_of_week`, `now.hour`, `now.month`)

**`op`** — operadores:
- Comparación: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`
- Set: `in`, `not_in`
- Texto: `starts_with`, `ends_with`, `contains`, `matches` (regex)
- Existencia: `exists`, `is_null`, `is_empty`
- Temporales: `within_last_days`, `on_day_of_month`, `is_birthday`
- Relacionales (agregaciones sobre historial): `count_events`, `sum_over`, `last_event_older_than`

**`actions`** — lista de efectos. Se ejecutan en orden, cada uno recibe el resultado del anterior en `action[i].result`.

### Catálogo inicial de actions

Cada action es una función registrada en `ActionRegistry`. En MVP:

| Action | Descripción |
|---|---|
| `wallet.credit_points` | Suma puntos a la wallet |
| `wallet.debit_points` | Resta puntos |
| `wallet.credit_cashback` | Suma cashback |
| `wallet.issue_voucher` | Emite cupón definido |
| `wallet.expire_points` | Fuerza expiración |
| `rewards.grant` | Otorga un reward del catálogo |
| `gamification.award_xp` | Suma XP |
| `gamification.award_badge` | Da insignia |
| `gamification.start_challenge` | Inscribe en un reto |
| `notifications.send` | Manda mensaje por canal |
| `campaign.enroll` | Entra a campaña/journey |
| `segment.add_tag` | Agrega tag al customer |
| `segment.remove_tag` | Quita tag |
| `raffle.grant_ticket` | Otorga boleta de rifa activa |

Extender el registro requiere un PR — no un cambio de config. Esto mantiene el sandbox seguro.

### Expresiones (`amount_expr`, plantillas)

Subset ultra-restringido:
- Aritmética básica: `+ - * / floor ceil round min max`.
- Acceso a `path` (los mismos de `conditions`).
- Concatenación de strings con `concat(a, b, ...)`.

**No hay `eval` de código arbitrario**. Se parsea con un mini-parser y se ejecuta en sandbox. Si la expresión falla, la action falla — no revienta el motor.

Plantillas de notificaciones usan sintaxis mustache-like para variables: `{{customer.name}}`, `{{data.amount_cop}}`.

### Límites y anti-abuso

Cada regla puede declarar `limits`:
- `per_customer_per_day`
- `per_customer_per_month`
- `per_customer_lifetime`
- `global_per_day` (para toda la ejecución de la regla en el tenant)

Y `cooldown_seconds` para evitar disparos consecutivos del mismo evento.

Fuera del DSL, el motor aplica **safeguards globales**:
- Loop detection (chain > 20 → kill switch de la regla y alerta).
- Rate limit por regla (default 100 fires/sec/tenant).
- Kill switch manual por regla (admin, o sistema).

---

## Versionado y publicación

- Toda edición de regla crea `RuleVersion(N)` inmutable.
- La versión activa se apunta con `active_version_id`.
- Eventos que llegan durante una migración de versión se evalúan con la versión que estaba activa al momento del `occurred_at` (no al de la evaluación).
- Rollback = poner `active_version_id` a una versión anterior.

Trazabilidad: cada `RuleExecution` guarda `rule_version_id` — sabemos exactamente qué código evaluó.

---

## Ejemplos canónicos

### Cumpleaños con perk

```json
{
  "name": "Feliz cumpleaños con cupón 20%",
  "trigger": { "event": "customer.birthday.reached" },
  "conditions": {
    "all": [
      { "path": "customer.consent.email", "op": "eq", "value": true }
    ]
  },
  "actions": [
    {
      "type": "wallet.issue_voucher",
      "params": {
        "voucher_template": "birthday_20pct",
        "expires_in_days": 30
      }
    },
    {
      "type": "notifications.send",
      "params": {
        "channel": "email",
        "template": "birthday_greetings"
      }
    }
  ]
}
```

### Reactivación por inactividad

```json
{
  "name": "Reactivar clientes inactivos 60 días",
  "trigger": { "event": "customer.inactivity.reached" },
  "conditions": {
    "all": [
      { "path": "data.days_inactive", "op": "gte", "value": 60 },
      { "path": "customer.lifetime_orders", "op": "gte", "value": 3 }
    ]
  },
  "actions": [
    { "type": "campaign.enroll", "params": { "campaign_id": "cmp_reactivation_60d" } }
  ],
  "limits": { "per_customer_per_month": 1 }
}
```

### Escala de niveles por XP

```json
{
  "name": "Sube a Gold al llegar a 5000 XP",
  "trigger": { "event": "gamification.xp.credited" },
  "conditions": {
    "all": [
      { "path": "wallet.xp_total", "op": "gte", "value": 5000 },
      { "path": "customer.tier", "op": "neq", "value": "gold" }
    ]
  },
  "actions": [
    { "type": "gamification.set_tier", "params": { "tier": "gold" } },
    { "type": "wallet.credit_points", "params": { "amount_expr": "500", "reason": "level_up_bonus" } },
    { "type": "notifications.send", "params": { "channel": "push", "template": "gold_tier_welcome" } }
  ]
}
```

---

## Testing de reglas (dry-run)

En la UI, cada regla tiene un botón **"Probar con este evento"**:
1. Admin pega o construye un evento sintético.
2. El motor evalúa la regla en modo `dry_run=true`.
3. UI muestra: qué condiciones pasaron, qué acciones se ejecutarían, qué límites cortarían, qué payload final saldría a cada action.

Sin efectos en el estado real. Este feature es clave para adoption — el admin no confía en un motor de reglas que no puede probar.

---

## 🚦 A validar contigo

### R1 · DSL propio vs motor externo

Alternativa: usar **Temporal**, **Camunda**, **n8n embebido** o **cel-python** en lugar de DSL propio.

**Cuestionamiento honesto**:
- Ventaja de externo: ya existe.
- Desventaja: dependencia enorme + curva de aprendizaje del admin + peor UX ("¿por qué hay un tab de Temporal?") + costo operativo.
- Ventaja de propio: alineado con el dominio, JSON simple, embebido en el producto.
- Desventaja: hay que construirlo. Estimación: 3-4 semanas de un dev senior para MVP funcional.

**Recomendación**: DSL propio. El motor es dominio, no plumbing.

### R2 · Editor visual — ¿MVP o V2?

- **MVP UI simple** (formularios): 1 semana. Cubre 90% de reglas.
- **MVP Editor visual** (canvas drag-drop): 4+ semanas. Cubre el mismo 90%.

**Recomendación**: MVP con UI simple + biblioteca de plantillas ("cumpleaños", "compra", "primer login", "referido"). Editor visual en V2. Mientras tanto, plantillas cubren adopción.

### R3 · Acciones "custom" del tenant

¿Un tenant puede definir sus propias acciones (webhook a su sistema)? Sí — `action: "webhook.call"` con URL y payload. Requiere allowlist de dominios y firma HMAC. **Recomendación**: sí desde MVP; es la forma de integrar con sistemas del tenant sin construir adapters específicos.
