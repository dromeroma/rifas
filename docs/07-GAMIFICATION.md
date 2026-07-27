# 07 · Gamification

Puntos son solo una moneda. La **gamificación es la mecánica que la hace adictiva**: niveles que suben, retos que aparecen, insignias que se coleccionan, rachas que se defienden.

Bien hecha, transforma un customer transaccional en un customer emocional. Mal hecha, es un sistema de "gimmicks" que nadie usa después de la primera semana.

---

## Principios de gamificación

**G1. La mecánica sigue al comportamiento deseado.**
No se agrega un badge porque "queda bonito"; se agrega porque queremos que el customer haga X más.

**G2. La recompensa siempre es tangible.**
Un badge simbólico solo enamora si desbloquea algo real (un cupón, un tier, una experiencia). Si no, es decoración.

**G3. Progresión clara y visible.**
El customer siempre sabe: cuánto le falta al siguiente nivel, cuánto vale ese nivel, qué está a punto de perder si no actúa hoy.

**G4. Justicia > dificultad.**
Nada más frustrante que "perdí mi racha por 1 hora". Diseñamos con `grace_periods` y `streak_freeze` — no crueles con el humano.

**G5. Sin farming.**
Cada mecánica tiene tope y detección de abuso. Nunca hay una manera obvia de "sacar puntos gratis".

**G6. Adaptable al vertical.**
Un gym gamifica visitas. Un ISP gamifica pagos puntuales. Un ecommerce gamifica frecuencia. La misma infraestructura sirve — la configuración cambia.

---

## Bloques de construcción

### XP (Experience Points)

Moneda **no canjeable** que mide la actividad del customer. Solo sube (nunca se resta salvo por castigo administrativo).

- Cada acción que queremos incentivar da XP.
- La cantidad la define una regla — no está hardcoded.
- Se acumula sin expirar.

Ejemplos de trigger → XP:
- `pos.sale.completed` → +10 XP
- `raffle.ticket.paid` → +25 XP
- `customer.referral.granted` → +50 XP
- `campaign.step.executed` (paso "abrir email") → +2 XP
- `gamification.challenge.completed` → +variable

### Levels / Tiers

Estado gamificado del customer. Cada tenant define su escalera:

```json
{
  "levels": [
    { "code": "bronze",   "name": "Bronce",   "min_xp": 0,     "color": "#c78d5b" },
    { "code": "silver",   "name": "Plata",    "min_xp": 500,   "color": "#c9d3d8" },
    { "code": "gold",     "name": "Oro",      "min_xp": 2000,  "color": "#e5c268" },
    { "code": "platinum", "name": "Platino",  "min_xp": 5000,  "color": "#b6b7bc" },
    { "code": "black",    "name": "Elite",    "min_xp": 15000, "color": "#111111" }
  ]
}
```

Al superar `min_xp` de un tier se emite `gamification.level.up` → gatilla reglas (cupón de bienvenida, mensaje, badge, etc.).

**Downgrade**: opcional por tenant. Dos modelos:
- **Sin downgrade** — una vez ganado, se mantiene. Simple, generoso, buen customer feeling.
- **Downgrade por inactividad** — si no acumulas XP en N meses, bajas. Más presión, más engagement, más peligroso.

Recomendación default: **sin downgrade** en MVP. Habilitar por tenant si lo pide.

### Badges (Insignias)

Objeto simbólico que se colecciona. Cada uno tiene:
- `code`, `name`, `description`, `image_url`, `rarity` (`common`, `rare`, `epic`, `legendary`).
- `award_condition` — regla que lo otorga (integrada con Rules Engine).
- `reveal_style` — algunos se muestran desde el inicio como "pendientes"; otros son sorpresa.

Ejemplos:
- 🎯 **Primera compra**
- 🔥 **7 días seguidos**
- 🎁 **Trajo 5 amigos**
- 🥇 **Top 1% del mes**
- 💎 **1 año de fidelidad**

Un badge se otorga vía `gamification.award_badge` (action del Rules Engine).

### Challenges / Missions

Retos con objetivo, ventana temporal y recompensa. Estructura:

```
challenge
├── id
├── tenant_id
├── name, description, image
├── audience         jsonb (segment o "all")
├── starts_at
├── ends_at
├── objective        jsonb  -- ej: { "event": "pos.sale.completed", "count": 3 }
├── progress_source  enum(event_count, sum_over, custom)
├── reward           jsonb  -- ref a Reward o inline
├── entry_mode       enum(auto, opt_in)
├── max_participants int?
├── state            enum(draft, published, running, ended, archived)
```

Ciclo:
1. Se publica.
2. Customer entra (auto o click "aceptar").
3. Cada evento relevante actualiza su progreso.
4. Al completar → recompensa + `gamification.challenge.completed`.
5. Al vencer sin completar → `gamification.challenge.failed`.

Tipos comunes:
- **Volumen**: "Compra 3 veces esta semana".
- **Frecuencia**: "Ven 5 días seguidos".
- **Cross-módulo**: "Compra 2 veces y usa 1 cupón".
- **Social**: "Trae 2 amigos que compren".
- **Discovery**: "Prueba un producto de la categoría X".

### Streaks (Rachas)

Contadores de "días seguidos con acción X". Tres estados:
- `active` — sigue vigente.
- `at_risk` — hoy no ha habido acción, mañana se rompe (mandar recordatorio).
- `broken` — se perdió.

Configuración por tipo de racha:
- `action_event` — qué cuenta ("compra", "check-in", "login").
- `window` — típicamente "por día calendario del tenant".
- `grace_periods` — permitir N misses sin romper (opcional).
- `streak_freeze` — item consumible que salva un día perdido (V2).

Cada extensión emite `gamification.streak.extended`; cada rotura `gamification.streak.broken`.

### Leaderboards

Rankings públicos o privados. Configurables por:
- **Métrica**: XP, puntos ganados, compras, referidos.
- **Ventana**: mes actual, semana, all-time.
- **Segmento**: general o filtrado.
- **Visibilidad**: público en la app del customer, o solo para admin.

Cuidado: pueden ser tóxicos (comparación social) — activarlos solo cuando aportan valor real al vertical (gyms, retos comunitarios).

---

## Anti-abuse (obligatorio, no opcional)

Los sistemas de puntos son atractivos para farmear. Sin defensas, cada tenant se convierte en cazador de sus propios usuarios.

**Techos de XP por ventana**:
- Cada regla que da XP declara `limits.per_customer_per_day` (default sano: 5x del promedio esperado).
- Techo global por customer por día (ej. 500 XP/día), configurable por tenant.

**Detección de patrones anómalos**:
- Score de "velocidad" — ganancia de XP > 3σ del percentil 99 del tenant → flag.
- Compras con reversos posteriores no pagan XP (débito automático al confirmar refund).

**Colusión**:
- Referidos que solo compran una vez y desaparecen → régimen de "confirmación tardía" (la comisión/reward se libera tras N días de actividad continuada del referido).

**Kill switches**:
- Admin puede pausar todas las reglas de un customer sospechoso mientras investiga.
- Pausa de un reto en curso sin afectar los ya completados.

---

## Experiencia del customer

El humano detrás del `customer_id` debe **sentir** la gamificación en cada punto de contacto — sin instalar nada.

Superficies de exposición:

- **Widget embebible**: los tenants embeben un componente JS en su sitio/checkout que muestra "Tienes 450 puntos · te faltan 50 para Plata".
- **Emails y WhatsApp**: cada notificación relevante incluye estado ("Ganaste 20 puntos · Total: 320 pts").
- **PWA opcional** (V2): página `perks.savvytrix.com/w/{tenant}` donde el customer ve su wallet, retos activos, badges. Sin login, autenticado por magic link.
- **Push notifications** (V3): "¡Estás a 1 compra de completar el reto!".

Cada tenant define qué superficies activa. Todas comparten diseño (ver [`10-UI_GUIDELINES.md`](10-UI_GUIDELINES.md)).

---

## Analytics de gamificación

KPIs esenciales:

- **Adopción por mecánica**: % de customers activos con al menos un badge / que entraron a un reto / con streak activa.
- **Efectividad de tier-up**: comportamiento pre/post subir de nivel.
- **Retos ganados vs iniciados** (por tipo, para tunear dificultad).
- **Ciclo de streak**: distribución de duración, causas de rotura.
- **ROI de reward** por mecánica.

Estos datasets alimentan luego el AI Engine.

---

## 🚦 A validar contigo

### GA1 · Downgrade de tier

**Opciones**:
- Sin downgrade nunca (mi recomendación default).
- Downgrade opt-in por tenant.
- Downgrade default con período de gracia.

**Trade-off**: downgrade crea engagement pero también resentimiento. Los mejores programas (Amex, Delta) sí lo usan pero con umbrales muy claros. Empresas más chicas suelen no usarlo.

**Recomendación**: sin downgrade default. Opt-in avanzado en V2.

### GA2 · Leaderboards públicos

Riesgo de privacy y de comparación negativa. Recomendación:
- **Off por default**.
- Cuando un tenant lo activa, customer decide opt-in individual.
- Nunca mostrar apellidos completos ni foto sin permiso explícito.

### GA3 · Streak freeze como item

Item consumible que "salva" una racha rota. Duolingo lo hizo icónico.

- Genera engagement fuerte.
- Cambia el vibe del producto de "loyalty B2B" a "app de consumo".

**Recomendación**: mecánica en V2, opt-in por tenant. En MVP salimos con streaks simples + grace period.
