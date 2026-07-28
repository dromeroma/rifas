# wallet

Contenedor de valor por (customer, tenant). Segundo pilar del dominio
tras `customer`. Ver [`docs/06-REWARDS_ENGINE.md`](../../../../docs/06-REWARDS_ENGINE.md)
sección Wallet.

## Agregado raíz

**Wallet** — una por (customer_id, tenant_id).

### Invariantes
- Toda mutación de balance pasa por el `wallet_ledger`.
- Balance nunca negativo salvo `allow_negative=True` en el débito.
- Voucher: transiciones monotónicas `active → redeemed|expired|revoked`.
- Voucher code único por tenant.

## Agregados hijos

- **WalletBalance** · snapshot rápido por (wallet, balance_type). Se
  recomputa desde el ledger si necesitas reconciliar.
- **WalletLedger** · append-only. Fuente de verdad.
- **Voucher** · cupones vivientes.

## BalanceType (catálogo)

`points`, `xp`, `cashback_cop`, `credit_seconds`, `visits`, `stamps`.
Extensible sin migración — columnas VARCHAR con enum enforcement en
Python.

## Eventos publicados

| type | cuándo |
|---|---|
| `wallet.created` | Wallet nueva creada |
| `wallet.points.credited` | Delta positivo en cualquier balance_type |
| `wallet.points.debited` | Delta negativo (excepto expiration) |
| `wallet.points.expired` | Delta negativo por vencimiento |
| `wallet.voucher.issued` | Cupón emitido |
| `wallet.voucher.redeemed` | Cupón canjeado |
| `wallet.voucher.expired` | Cupón vencido |
| `wallet.voucher.revoked` | Cupón anulado por admin |

Constantes canónicas en `app.modules.wallet.events`.

## Eventos consumidos

| type | efecto |
|---|---|
| `customer.identified` | Crea wallet automáticamente (idempotente) |

Handler: `wallet.create_on_customer_identified` en `handlers.py`.

Es el primer caso end-to-end del bus interno — un evento del módulo
`customer` dispara acción en `wallet` sin acoplamiento directo.

## Dependencias declaradas

- `app.modules.platform.events` — publicar y suscribir.
- `app.modules.customer.events` — solo constantes de nombres de
  eventos (no lógica ni modelos).
- `app.core.database.Base` — modelos ORM.

Contratos import-linter: cumple. `wallet` es leaf del sub-contrato
"wallet/rewards/gamification independent" — no importa `rewards` ni
`gamification`. Puede importar constantes de `customer.events`
(constantes, no modelos ni service).

## Ejemplos

```python
from app.modules.wallet import (
    CreditRequest, LedgerCause, BalanceType,
    find_or_create, credit, snapshot,
)
from app.modules.platform.events import Actor, ActorKind

# Crear (o traer existente)
wallet = await find_or_create(
    db,
    tenant_id=42,
    customer_id=123,
    actor=Actor(kind=ActorKind.MEMBER, id=member.id),
)

# Acreditar 50 puntos por regla
await credit(
    db,
    wallet_id=wallet.id,
    actor=Actor(kind=ActorKind.RULE, id="rul_01H..."),
    request=CreditRequest(
        balance_type=BalanceType.POINTS,
        amount=50,
        cause=LedgerCause.RULE,
        cause_ref="rul_01H...",
        memo="compra >50k",
    ),
)

# Snapshot rápido para UI
snap = await snapshot(db, wallet_id=wallet.id)
# snap.balances → [BalanceOut(...)]
# snap.active_vouchers → int

await db.commit()
```

## Convención para handlers cross-módulo

Todo handler que este módulo publique va en `handlers.py`. Los
handlers son idempotentes por diseño (uso de find_or_create, checks
de estado antes de mutar). El registro (`@registry.on`) se dispara al
importar `app.modules.wallet` — el módulo se importa desde
`app.modules._handlers` al arrancar.
