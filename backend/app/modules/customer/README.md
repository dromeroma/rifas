# customer

Núcleo del dominio de Savvy Perks — representación unificada del
cliente final del tenant. Ver [`docs/02-DOMAIN.md`](../../../../docs/02-DOMAIN.md)
sección "Customer (núcleo)".

## Agregado raíz

**Customer** (vive en la tabla `customers`, gestión compartida con el
legacy `raffles` durante la Fase 1).

### Invariantes
- Todo Customer tiene al menos una `CustomerIdentity`.
- La tupla `(tenant_id, kind, value_normalized)` es única —
  imposible tener dos customers distintos con el mismo email/phone.
- Los consents son append-only. Nunca se editan filas — se agregan.

## Agregados hijos

- **CustomerIdentity** · N por customer. Reconocimiento por email,
  phone, document, external_id. Cada uno normalizado y opcionalmente
  verificado.
- **CustomerPreference** · una por (customer, channel). Opt-in por
  canal de notificación.
- **CustomerConsent** · append-only. Habeas Data / GDPR compliance.

## Eventos publicados

| type | cuándo |
|---|---|
| `customer.identified` | Un customer se conoce por primera vez |
| `customer.identity.added` | Se le conecta una identity adicional |
| `customer.identity.verified` | OTP correcto sobre identity |
| `customer.profile.updated` | Cambian atributos base o custom |
| `customer.consent.granted` | Autoriza uso de datos |
| `customer.consent.revoked` | Retira consent |
| `customer.merged` | Merge de duplicados |

Constantes canónicas en `app.modules.customer.events`.

## Eventos consumidos

Ninguno en Fase 1. Wallet/Rewards se suscribirán a
`customer.identified` en Fase 2 (sprint próximo).

## Endpoints

Ninguno expuesto en Fase 1 — sólo API interna vía service. El router
público se agrega en el sprint que introduzca el panel de admin de
customers.

## Dependencias declaradas

- `app.modules.platform.events` — publica eventos vía `publish()`.
- `app.core.database.Base` — modelos ORM.
- `app.models.customer.Customer` — **deuda técnica documentada**: se
  usa solo en `service._create_legacy_customer()` para crear rows en
  la tabla `customers` compartida con el legacy. Se retira post-cutover
  cuando este módulo pase a ser fuente de verdad exclusiva.

Contratos de import-linter respetados: la deuda no viola ningún
contrato porque `app.models.customer` no es un módulo de dominio de
`app.modules.*`.

## Ejemplos de uso

```python
from app.modules.customer import (
    IdentifyRequest, IdentityIn, IdentityKind, identify,
)
from app.modules.platform.events import Actor, ActorKind

# Find or create
result = await identify(
    db,
    tenant_id=42,
    actor=Actor(kind=ActorKind.MEMBER, id=member.id),
    request=IdentifyRequest(
        identity=IdentityIn(kind=IdentityKind.EMAIL, value="Ana@Mail.com"),
        full_name="Ana Pérez",
        additional_identities=[
            IdentityIn(kind=IdentityKind.PHONE, value="+57 300 111 2222"),
        ],
        source="landing_form",
    ),
)
# result.customer_id — id existente o nuevo
# result.first_time — True si se creó en este llamado
# result.identities — lista completa post-operación
await db.commit()
```

```python
from app.modules.customer import grant_consent

await grant_consent(
    db,
    tenant_id=42,
    customer_id=result.customer_id,
    purpose="marketing",
    source="landing_form_checkbox",
    policy_version="2026-Q3",
)
await db.commit()
```
