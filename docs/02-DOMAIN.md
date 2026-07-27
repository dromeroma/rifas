# 02 · Dominio

Modelo de dominio del sistema — bounded contexts, agregados, lenguaje ubicuo.

Guía de lectura: los **bounded contexts** son los universos con reglas propias; los **agregados** son las raíces de consistencia dentro de cada uno; los **eventos** son cómo se enteran unos de otros.

---

## Lenguaje ubicuo

Antes de todo, alineamos vocabulario. Estas palabras significan **exactamente** esto en el código, en las APIs y en el producto:

| Término | Significado |
|---|---|
| **Tenant** | Empresa que usa Savvy Perks. Es el cliente del SaaS. |
| **Member** | Usuario del tenant (admin, staff, etc.). Es quien hace login en el panel. |
| **Customer** | Cliente final del tenant. **El centro del dominio.** No hace login normalmente. |
| **Identity** | La forma en que reconocemos a un Customer: email, teléfono, documento, external_id. Un Customer puede tener varias identities. |
| **Wallet** | Contenedor de valor y estado de un Customer: puntos, cupones, cashback, insignias, tickets, tier, streak, etc. Uno por (customer, tenant). |
| **Perk** | Cualquier cosa de valor que un Customer puede ganar o recibir: puntos, cupón, cashback, insignia, boleta, gift card, experiencia. |
| **Reward** | Definición de un Perk concreto ofrecido por el tenant (ej. "cupón 20% en menú del día"). |
| **Redemption** | Acto de un Customer canjeando un Reward — quema valor de la Wallet. |
| **Rule** | "SI *evento/condición* ENTONCES *acciones*". Vive en el Rules Engine. |
| **Campaign** | Emisión dirigida y programada de perks o mensajes a un segmento. |
| **Segment** | Grupo dinámico de Customers definido por criterios (RFM, tags, atributos, comportamiento). |
| **Event** | Hecho de negocio inmutable con nombre en pasado (`purchase.completed`, `birthday.reached`, `points.awarded`). |
| **Level / Tier** | Estado gamificado del Customer en el tenant (`bronze`, `silver`, `gold`, personalizable). |
| **Streak** | Racha de acciones repetidas (ej. "5 días seguidos comprando"). |
| **Challenge / Mission** | Retos con objetivo, ventana y recompensa. |
| **Badge / Achievement** | Insignia otorgada por completar algo memorable. |

**Regla de oro**: si un doc, PR o pantalla usa "usuario" es ambiguo — usa `Member` (staff del tenant) o `Customer` (cliente final del tenant).

---

## Bounded contexts

Cada bounded context es un módulo del monolito, con su propio esquema conceptual (aunque comparta base de datos física). Puede migrar a servicio independiente sin reescribir el resto.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Identity & Access                        │
│      (Tenant, Member, Auth, RBAC, Savvy Identity SSO)           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Customer  (núcleo del dominio)               │
│      Customer, Identity, Profile, Preferences, Consent          │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐    ┌────────────────┐    ┌───────────────────┐
│    Wallet     │    │  Gamification  │    │      Rewards      │
│ balances,     │    │  levels, XP,   │    │ catalog, redemp-  │
│ transactions  │    │  badges, quests│    │ tions, inventory  │
└───────────────┘    └────────────────┘    └───────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Rules Engine                              │
│    triggers · conditions · actions · rule versions              │
└─────────────────────────────────────────────────────────────────┘
                                ▲
                                │  eventos
┌─────────────────────────────────────────────────────────────────┐
│                       Event Bus                                 │
│  outbox → dispatcher → handlers (in-process, luego servicios)   │
└─────────────────────────────────────────────────────────────────┘
                                ▲
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────────────┐    ┌────────────────┐    ┌───────────────────┐
│  Campaigns    │    │  Notifications │    │     Analytics     │
│ segments,     │    │  email · SMS · │    │  KPIs · reports · │
│ journeys      │    │  push · WA     │    │  cohorts          │
└───────────────┘    └────────────────┘    └───────────────────┘
                                                     │
                                                     ▼
                                       ┌────────────────────┐
                                       │   AI & Insights    │
                                       │  RFM · churn · reco│
                                       └────────────────────┘

  Módulos verticales (consumen y publican eventos):

  Raffles  ·  POS-adapter  ·  Water-adapter  ·  Ecommerce-adapter
```

---

## Contextos en detalle

### 1. Identity & Access (existente, evoluciona)

Agregados: `Tenant`, `Member`, `Session`, `RefreshToken`, `MagicLink`.

Evolución:
- **Savvy Identity SSO**: un `Member` puede loguearse en Perks, POS, Water con la misma sesión. Implementación: JWT con `issuer=savvy-identity` y `audience` por producto. Cada producto valida contra Savvy Identity (JWKS público).
- **Delegated tenant access**: consultores/agencias pueden acceder a varios tenants sin crear cuentas separadas.

### 2. Customer (núcleo)

**Agregado raíz**: `Customer`.
- `Customer` no es simplemente "el usuario" — es la representación unificada del ser humano al que el tenant sirve.
- Un `Customer` tiene **N identities** (`email`, `phone`, `document`, `external_id`). Sirve para reconocerlo desde cualquier canal (POS, ecommerce, WhatsApp).
- Un `Customer` tiene **1 profile** con atributos base (nombre, cumpleaños, ciudad, foto) + `custom_attributes JSONB` (extensibles por tenant).
- Un `Customer` tiene **preferencias** de comunicación (canales opt-in, horarios, idioma) y **consents** con timestamp y evidencia (GDPR/Habeas Data).

Reglas invariantes:
- No puede existir un `Customer` sin al menos una identity.
- Las identities son únicas por (tenant, tipo, valor).
- Un merge de duplicados es una operación explícita, auditada.

Migración desde estado actual: el modelo `Customer` de rifas ya tiene la mayoría — se enriquece con identities múltiples y preferences separadas.

### 3. Wallet

**Agregado raíz**: `Wallet` (una por `(customer_id, tenant_id)`).

Contenido:
- **Balances** por tipo (`points`, `cashback_cop`, `credit_seconds` para ISP, `visits`, etc.). El tipo es libre pero controlado por catálogo.
- **Ledger** de transacciones (append-only) — cada crédito/débito con causa (`rule_id`, `campaign_id`, `redemption_id`, `manual`).
- **Vouchers activos** (cupones/gift cards) con estado, expiración, condiciones.
- **Badges** ganados.
- **Level actual** (proyectado desde XP).
- **Streaks activas**.

Reglas invariantes:
- Balance nunca negativo (excepto tipos que lo permitan explícitamente, ej. crédito con overdraft).
- Toda mutación pasa por el ledger. No hay UPDATE directo del balance.
- Expiración por tipo: puntos pueden expirar; badges no; cupones sí.

Por qué wallet es un contexto propio (no colgado del customer): permite auditoría contable estricta, invariantes por tipo, y —a futuro— extraerlo como servicio dedicado si crece.

### 4. Rewards

**Agregados**:
- `Reward` (catálogo — la definición de qué se puede canjear).
- `Redemption` (el acto de canje: quién, qué, cuándo, resultado, entrega).
- `Inventory` (para rewards con stock limitado).

Tipos de reward (universales):
- `POINTS` — sumar puntos a la wallet.
- `COUPON` — código de descuento.
- `CASHBACK` — devolución en dinero al medio de pago.
- `GIFT_CARD` — saldo canjeable (propio o de terceros).
- `PRODUCT` / `SERVICE` — canje físico o experiencial.
- `RAFFLE_TICKET` — genera boleta en el módulo Raffles.
- `CONNECTIVITY_CREDIT` — segundos/GB de internet (ISP).
- `EXPERIENCE` — reserva de evento/experiencia.
- `EXTERNAL` — cupón/beneficio de un partner (marketplace futuro).

### 5. Gamification

**Agregados**: `LevelDefinition`, `BadgeDefinition`, `Challenge`, `ChallengeParticipation`.

Roles del contexto:
- **XP y niveles**: cada acción da XP (configurable). Curva de niveles definida por tenant (o preset).
- **Badges**: se otorgan por reglas ("compró 10 veces", "cumpleaños celebrado", "trajo 3 referidos").
- **Challenges/missions**: retos con objetivo, deadline y premio (ej. "Compra 3 veces esta semana → 500 puntos").
- **Streaks**: rachas mantenidas.
- **Leaderboards** opcionales por tenant.

Importante: gamificación **no genera valor por sí sola**, se apoya en Rewards y Wallet. Un badge por sí solo es simbólico; un badge que desbloquea un cupón es adictivo.

### 6. Rules Engine

**Agregados**: `Rule`, `RuleVersion`, `RuleExecution`.

Modelo mental:
- Cada `Rule` tiene: `trigger` (evento que la despierta), `conditions` (predicados sobre el evento + estado del customer), `actions` (efectos).
- Cada `RuleVersion` es inmutable. Publicar una edición crea una versión nueva.
- Cada `RuleExecution` registra: input event, versión evaluada, condiciones OK/KO, acciones aplicadas, latencia, errores.

Ver [`05-RULES_ENGINE.md`](05-RULES_ENGINE.md) para el DSL.

### 7. Campaigns

**Agregados**: `Segment`, `Campaign`, `Journey`, `CampaignRun`.

- `Segment`: definición dinámica ("customers con nivel gold que compraron en últimos 30 días").
- `Campaign`: emisión dirigida a un segmento (one-shot, recurrente, o disparada por evento).
- `Journey`: secuencia multi-paso con esperas y bifurcaciones ("día 0: bienvenida, día 3: cupón, día 7: check si usó, si no → recordatorio").
- `CampaignRun`: instancia ejecutada, con métricas de delivery, apertura, click, canje.

### 8. Notifications

**Agregados**: `NotificationTemplate`, `NotificationDelivery`.

Canales soportados: `email`, `sms`, `whatsapp`, `push`, `in_app`, `webhook`.

Responsabilidad única: recibir "envía este mensaje a este customer por este canal", y entregarlo con reintentos, tracking, y respeto a preferencias/consents.

### 9. Analytics & Reporting

Materializaciones y vistas sobre los eventos y el estado. NO es un módulo de eventos nuevos — es un consumidor.

Salidas:
- KPIs de tenant (retention, LTV, churn, redemption rate, points velocity).
- Cohortes.
- Embudos configurables.
- Reportes exportables.

### 10. AI & Insights

Ver [`08-AI.md`](08-AI.md). En MVP: heurísticas + RFM. En V2+: modelos entrenados sobre los eventos históricos.

### 11. Módulos verticales

Adaptadores que traducen dominio de otros productos → eventos de Perks. Ejemplos:
- **Raffles** (el actual Boletera, refactorizado): emite `raffle.ticket.paid`, `raffle.customer.won`, etc.
- **POS-adapter** (Savvy POS): emite `sale.completed`, `sale.refunded`.
- **Water-adapter** (Savvy Water): emite `subscription.paid`, `subscription.overdue`.
- **Ecommerce-adapter** (Shopify, WooCommerce, custom via API).

Cada módulo vertical es **cliente** de Perks — publica eventos, consume acciones. No conoce el modelo interno de Perks.

---

## Identificación de customer (importante)

Cómo reconocemos a un Customer cuando llega un evento sin `customer_id` explícito:

1. **Búsqueda por identity match** en orden: `external_id` → `email` → `phone` → `document`.
2. Si no existe, se crea un Customer nuevo **si el evento lo permite** (configurable por tipo).
3. Si dos identities colapsan (ej. dos customers distintos con el mismo email tras normalizar), se marca `duplicate_candidate` y el admin decide merge.

---

## 🚦 A validar contigo

### D1 · Customer graph cross-tenant

**Escenario**: Deimer es cliente en "Café Central" (tenant A) y en "Pizzería La Nona" (tenant B). Ambos usan Savvy Perks.

- **Opción 1**: Customers totalmente separados. Simple, aislado, pero no hay "wallet consumidor unificado".
- **Opción 2**: Customer global con "vistas" por tenant. Complejo, pero habilita el Consumer Wallet futuro.
- **Opción 3** ✨ *(recomendación)*: Customers separados en cada tenant, pero un **Savvy Identity** central los conecta si el cliente hace opt-in explícito ("quiero ver todos mis perks en una app"). Mejor privacidad, mejor unit economics, camino claro al Consumer Wallet.

### D2 · Identidad de contacto

**Pregunta**: en Colombia, ¿el identificador maestro debe ser `phone` o `email`?

- WhatsApp / Nequi / Daviplata → `phone` es rey.
- Ecommerce / SaaS → `email` es estándar.

**Recomendación**: soportar ambos como identities primarias, pero el sistema debe manejar `phone` con la seriedad de un identificador (normalización E.164, verificación por OTP, deduplicación).

### D3 · Multi-currency de balances

**Pregunta**: ¿un tenant puede tener wallets con más de un tipo de balance simultáneo? Ej. un ISP que da `credit_seconds` **y** `points`.

**Recomendación**: sí, wallet es plural en balances desde el diseño. Cada tenant define en un catálogo qué tipos usa.

### D4 · Modelo de identidad entre productos Savvy

**Pregunta**: cuando llegue Savvy POS con su propia BD, ¿el `Customer` en Perks y el `Customer` en POS son el mismo registro físico?

- **Opción A**: Cada producto tiene su propio Customer, sincronizados vía eventos. Aislamiento fuerte.
- **Opción B** ✨: Savvy Identity guarda `identities` compartidas + `customer_profile` compartido; cada producto guarda su propio `customer_state` local.

Opción B es más trabajo pero permite reportes unificados y el Consumer Wallet.
