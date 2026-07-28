# rules

Rules Engine V1 — el corazón operativo del producto. Traduce "cuando
pase X, haz Y" en configuración que reacciona a eventos del bus.
Ver [`docs/05-RULES_ENGINE.md`](../../../../docs/05-RULES_ENGINE.md).

## Modelo

- **Rule** — regla lógica del tenant. Apunta a la RuleVersion activa.
- **RuleVersion** — DSL inmutable. Cada edición crea versión nueva.
- **RuleExecution** — una fila por evaluación (evento × regla).
  Telemetría + base para "últimas ejecuciones" en el admin.

## DSL

```json
{
  "name": "Puntos por compra sobre 50k",
  "trigger": { "event": "pos.sale.completed" },
  "conditions": {
    "all": [
      { "path": "data.amount_cop", "op": "gte", "value": 50000 },
      { "path": "customer.tier", "op": "in", "value": ["bronze", "silver"] }
    ]
  },
  "actions": [
    {
      "type": "wallet.credit_points",
      "params": {
        "amount": "expr:floor(data.amount_cop / 1000)",
        "reason": "compra >50k"
      }
    }
  ],
  "limits": { "per_customer_per_day": 5, "global_per_day": 10000 },
  "cooldown_seconds": 60
}
```

Namespaces del path:
- `data.*` payload del evento
- `event.*` top-level (type, id, tenant_id, occurred_at, actor, subject)
- `customer.*` snapshot del customer
- `wallet.*` balances por tipo
- `tenant.*` config del tenant
- `now.*` day_of_week, hour, month, day_of_month, year, epoch_ms

Operadores: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`,
`starts_with`, `ends_with`, `contains`, `matches`, `exists`, `is_null`,
`is_empty`.

Expresiones (en params, prefijo `expr:`): aritmética con `floor`,
`ceil`, `round`, `min`, `max`, `abs`, `int`, `float`, `concat`.
Sandbox AST — cualquier otro nodo levanta `UnsafeExpressionError`.

## Actions bundled (Fase 1)

| type | efecto |
|---|---|
| `wallet.credit_points` | Suma puntos a la wallet |
| `wallet.credit_cashback` | Suma cashback_cop |
| `wallet.credit_xp` | Suma XP |
| `wallet.issue_voucher` | Emite un cupón |

Agregar action nueva = PR con `@action_registry.register("...")`.
El registry es cerrado por diseño (safety).

## Eventos publicados

| type | cuándo |
|---|---|
| `rules.rule.published` | Se creó o editó una regla |
| `rules.rule.disabled` | Se desactivó una regla |
| `rules.rule.fired` | Condiciones OK + acciones ejecutadas |
| `rules.rule.skipped` | Condiciones no pasaron o rate-limit |
| `rules.rule.errored` | Falló una acción durante la ejecución |

## Eventos consumidos

**TODOS** — el handler `rules.evaluate_on_any_event` se suscribe al
wildcard `*` del bus. En cada evento entrante, filtra reglas por
`tenant_id + event.type` y las evalúa.

Auto-invocación bloqueada: eventos `rules.*` NO disparan más
evaluaciones (previene loops).

## Anti-abuse enforced

- `limits.per_customer_per_day/month/lifetime`
- `limits.global_per_day`
- `cooldown_seconds` desde el último `fired` del mismo (rule, customer)

Todo se contabiliza contra `rule_executions.status = FIRED` +
`dry_run = false`.

## Dependencias declaradas

- `app.modules.platform.events` — publica y consume vía bus.
- `app.modules.wallet` — actions bundled la usan.
- `app.modules.customer.models` (via events.py de customer) — no
  hay imports directos, sólo el nombre `customer.identified` en tests.
- `app.models.customer.Customer` — **deuda documentada**: se usa para
  snapshot legacy del customer en `service._load_customer_snapshot`.
  Se retira cuando el módulo customer sea fuente de verdad.

## Ejemplos

```python
from app.modules.rules import (
    RuleCreateRequest, RuleDefinition, Trigger, Predicate,
    ConditionGroup, Action, Limits, create_rule,
)
from app.modules.platform.events import Actor, ActorKind

request = RuleCreateRequest(
    code="bienvenida_puntos",
    definition=RuleDefinition(
        name="Bienvenida: 100 pts al primer identify",
        trigger=Trigger(event="customer.identified"),
        conditions=ConditionGroup(
            all=[Predicate(path="data.first_time", op="eq", value=True)],
        ),
        actions=[
            Action(
                type="wallet.credit_points",
                params={"amount": 100, "reason": "welcome"},
            ),
        ],
    ),
)
rule = await create_rule(
    db, tenant_id=42, actor=Actor(kind=ActorKind.MEMBER, id=1),
    request=request,
)
await db.commit()
```

## Dry-run

```python
from app.modules.rules import DryRunRequest, dry_run

result = await dry_run(
    db,
    rule_id=rule.id,
    request=DryRunRequest(
        event_type="customer.identified",
        event_data={"first_time": True},
        customer_id=123,
    ),
)
# result.matched_conditions, result.actions_planned, result.resolved_paths
```
