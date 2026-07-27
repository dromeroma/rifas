# 09 · Roadmap

Tres horizontes: **MVP** (para vender), **V2** (para retener), **Enterprise** (para escalar).

Filtro obligatorio para cada ítem del roadmap:
> ¿Ayuda a que el cliente vuelva? Y ¿tiene una métrica que lo pruebe?
> Si alguna respuesta es "no", va al backlog o al basurero.

---

## Fase 0 · Comprensión y arquitectura (cerrada 2026-07-26)

**Duración**: 1 semana.

**Salidas**:
- ✅ Docs completos (los 11 documentos numerados).
- ✅ ADRs iniciales firmados (ADR-001 a ADR-007).
- ✅ Decisiones fundacionales cerradas por el founder.
- ✅ Freeze de features en Boletera confirmado hasta 5-ago-2026.

**Decisiones cerradas**:
- Foco comercial MVP: 3 verticales (restaurantes, gimnasios, rifas). Arquitectura horizontal.
- Consumer Wallet: V3 como producto independiente ("Savvy Wallet").
- Rename del repo `dromeroma/rifas` → `dromeroma/savvy-perks` al cierre de Fase 0.
- Estrategia zero-downtime obligatoria (ADR-007) durante toda la transformación.
- Sitio comercial premium arranca en paralelo (Fase 0.5).

---

## Fase 0.5 · Sitio comercial premium (en paralelo con Fase 1)

**Duración estimada**: 2–3 semanas.

**Objetivo**: presencia web premium que genere pipeline antes de que el MVP del producto esté listo. Ver [`11-COMMERCIAL_SITE.md`](11-COMMERCIAL_SITE.md).

**Alcance de Fase 0.5**:
- Hero premium con animación viva + CTAs.
- Secciones: Cómo funciona · Módulos (versión reducida) · Verticales · Waitlist + booking de demo · Footer.
- Sin pricing público todavía.
- Copy definitivo en español LATAM.
- SEO base: meta tags, sitemap, OG, LD-JSON.
- Analítica: PostHog o Plausible con eventos de conversión.
- Deploy independiente del producto (Astro standalone en Cloudflare Pages).

**Prerrequisitos**:
- ✅ Decisiones C1-C6 del doc de sitio comercial cerradas (2026-07-26).
- ✅ Diseño y copy in-house: Claude actúa como Senior Designer + Senior Copywriter (C5/C6).
- ⏳ Cutover de rifas ejecutado (5-ago-2026).

**Costo de infraestructura externa**: USD 0. Todo el trabajo es interno.

**Métrica de éxito**:
- 100+ leads calificados en waitlist antes del launch del MVP.
- 30+ demos agendadas con prospectos serios.
- Lighthouse ≥ 95 en Performance, SEO, Accesibilidad.

---

## Fase 1 · Cimientos (MVP core)

**Duración estimada**: 4–6 semanas después de Fase 0.

**Objetivo**: refactor no-breaking del backend actual para dejar los cimientos del nuevo modelo de dominio.

**Alcance**:
- **Repositorio reorganizado** en `apps/api/modules/*` y `apps/web/src/app/features/*`.
- **Módulo `platform`**: bus + outbox + audit + tenancy consolidados como librería interna.
- **Módulo `identity`**: `Tenant`, `Member`, `Session`, JWT+refresh, magic link — refactor del auth actual.
- **Módulo `customer`**: `Customer` + `Identity` múltiples + `Profile` + `Preferences` + `Consent`. Migración de datos actuales.
- **Módulo `wallet`**: esqueleto con balances + ledger. Sin mecánicas complejas todavía — solo `points`.
- **Módulo `raffles`**: la Boletera actual movida bajo este namespace. Publica sus eventos al nuevo bus. Sigue funcionando idéntica para los clientes actuales.
- **Event bus operativo**: outbox + dispatcher + `event_handled` + retries + dead letter. Al menos 5 eventos publicándose de verdad.
- **UI**: shell nuevo del admin (design system inicial) — todavía puede mostrar solo lo que ya existía (rifas), pero con la carcasa nueva.

**Métrica de éxito de Fase 1**:
- Backend con cero regresiones (todos los flujos actuales pasan).
- Al menos 100 eventos/día generados por los tenants existentes.
- Módulos con boundaries verificados por `import-linter` en CI.

**No incluye** todavía: Rules Engine, Rewards, Campaigns, Gamification, Notifications avanzadas.

---

## Fase 2 · MVP vendible (Perks Core)

**Duración estimada**: 6–8 semanas después de Fase 1.

**Objetivo**: producto que se le pueda vender a un restaurante, un gym o una tienda pequeña y **empiece a demostrar valor en 24 horas**.

**Alcance**:

### Rules Engine v1
- DSL JSON + UI de edición por formularios.
- Biblioteca de 10-15 plantillas ("cumpleaños", "primera compra", "compra recurrente", "referido", "inactividad", ...).
- Modo dry-run.
- Límites y anti-abuso.

### Rewards Engine v1
- Catálogo con kinds: `POINTS`, `COUPON`, `CASHBACK`, `RAFFLE_TICKET`.
- Redemption con débito atómico y trazabilidad.
- Cupones con código único, expiración, inventario.

### Wallet completa
- Multi-balance (`points`, `cashback_cop`, `xp` mínimo).
- Ledger navegable.
- Vouchers activos.

### Gamification v1
- Niveles configurables por tenant.
- XP acumulable.
- 5-10 badges predefinidos + creación custom simple.
- Sin retos ni streaks todavía.

### Campaigns v1
- Segmentos dinámicos con predicados.
- Broadcast one-shot con audiencia + canal + template.
- Sin journeys multi-paso todavía.

### Notifications v1
- Canales: email + WhatsApp (via provider) + in-app.
- Templates con variables y preview.
- Consents y opt-outs.

### AI v1 (Ola 1 — heurísticas)
- Segmentos RFM automáticos.
- Churn score heurístico.
- Panel de 3 sugerencias tipo tarjeta.

### Superficies del customer
- Widget embebible: "Tienes X puntos · siguiente nivel a Y".
- Página wallet PWA por tenant (`/w/{tenant_slug}`) con magic link.

### Integraciones nativas
- **WhatsApp Business** vía provider (a decidir en fase de compra).
- **Wompi / Nequi** — ya integrado, se conserva.

### Onboarding y billing SaaS
- Signup de tenant.
- Trial de 14 días.
- Planes: `Starter`, `Growth`, `Business` (precios a definir en negocio).
- Billing con proveedor (Wompi Subscriptions o Stripe si mercado LATAM lo pide).

**Métrica de éxito de Fase 2**:
- 3-5 tenants pagando activos, no relacionados con el fundador.
- Repeat Rate promedio de esos tenants > 20% en los primeros 30 días.
- NPS del admin > 40.

---

## Fase 3 · Retención (V2 — Perks Growth)

**Duración estimada**: 3-6 meses después del MVP.

**Objetivo**: profundizar la mecánica y demostrar ROI medible al tenant.

**Alcance**:

### Rules Engine v2
- **Editor visual** drag-drop.
- Marketplace de plantillas comunitario (tenant sube su regla y otros la copian).

### Gamification v2
- Challenges/missions completos.
- Streaks con grace periods + streak freeze.
- Leaderboards opcionales.

### Campaigns v2 — Journeys
- Secuencias multi-paso con esperas, bifurcaciones, splits A/B.
- Trigger-based journeys (evento → journey de N días).

### AI v2 (Ola 2)
- Churn model entrenado por tenant.
- Next-best-reward por customer.
- Optimal send time.

### Integraciones
- **Shopify / WooCommerce** — adapters oficiales.
- **Savvy POS** — integración nativa vía event bus interno.
- **Savvy Water** — igual.

### Consumer surfaces avanzadas
- PWA del customer con retos activos, progreso visual, notificaciones.
- Push notifications (web y app companion futura).

### Analytics profundo
- Cohortes.
- Embudos configurables.
- Reportes exportables.
- Dashboard de ROI por campaña.

**Métrica de éxito de Fase 3**:
- 20+ tenants pagando.
- Retención de tenants > 90% mes a mes.
- Uso semanal de reglas custom (creadas por el propio tenant, no plantillas) > 60%.

---

## Fase 4 · Enterprise y Marketplace (V3)

**Duración estimada**: 6-12 meses después de V2.

**Objetivo**: convertirnos en plataforma, no solo en producto.

**Alcance**:

### Marketplace de Perks
- Rewards públicas cross-tenant con settlement.
- Consumer Wallet (marca "Savvy Wallet") — el cliente final ve **todos** sus perks de todas las empresas donde compra.
- Network effects reales.

### AI v3 (Ola 3)
- LLM assistant integrado ("Perks Copilot").
- Generación de campañas con lenguaje natural.
- Detección de anomalías con narrativa.

### Enterprise features
- SSO SAML/OIDC para el tenant.
- Multi-account (una organización con varios tenants).
- Data residency configurable.
- SLA 99.9%.
- Auditoría exportable a SIEM.
- Contratos DPA/BAA firmables.

### Ecosistema Savvy consolidado
- Savvy Identity como SSO real de todo el ecosistema.
- Savvy Bus como event bus cross-producto.
- Reportes unificados entre POS + Perks + Water.

### API pública y SDKs
- SDKs oficiales JS/TS, Python, PHP.
- Documentación tipo Stripe/Twilio.
- Webhook portal con debug tools.

**Métrica de éxito de Fase 4**:
- 100+ tenants.
- Al menos un enterprise cliente ($50k+ ACV).
- Un partner marketplace con >10 rewards públicas activas.

---

## Backlog (sin fecha)

Ideas que valen la pena vigilar pero no comprometemos.

- App móvil nativa iOS/Android (por ahora PWA cubre).
- Perks para eventos (concerts, festivals) — módulo vertical.
- API de fidelización usable por gobiernos/programas sociales.
- Integración con billeteras cripto (opcional, sin fervor).
- White-label total (dominios custom por tenant, no solo subdominios).
- Perks embebido en el checkout de otros SaaS (partnerships).

---

## Decisiones críticas por fase

| # | Decisión | Fase |
|---|----------|------|
| DC-1 | Multi-vertical enfoque comercial vs 3 verticales foco | MVP (0/1) |
| DC-2 | Consumer Wallet: sí/no y cuándo | V2 o V3 |
| DC-3 | Repo rename `rifas` → `savvy-perks` | Fase 1 |
| DC-4 | Provider WhatsApp Business (Twilio, 360dialog, Meta directo) | MVP |
| DC-5 | Provider Email transaccional (Resend, Postmark, SES) | MVP |
| DC-6 | Provider SMS | V2 |
| DC-7 | Billing: Stripe LATAM (limitado), Wompi Subs, Kushki, otro | MVP |
| DC-8 | ¿Consumer Wallet como marca propia (Savvy Wallet) o embebida por tenant? | V3 |
| DC-9 | Data residency: seguimos en Supabase US-East, o migramos a LATAM | Enterprise |

Cada decisión abre un ADR cuando se aproxime la fase.

---

## Cadencia y rituales

- **Sprints de 2 semanas** con demo interno viernes.
- **Retro cada 4 semanas**.
- **Planning trimestral** contra este roadmap; se ajusta si hay evidencia de mercado.
- **Métricas de producto revisadas semanalmente** — no permitimos que se pierda de vista.

---

## 🚦 A validar contigo

### R1 · Ventana de freeze de Boletera

Recomendación: freeze de features en el módulo Raffles hasta pasar el sorteo del 4-ago-2026. Refactor a módulo en paralelo sin exponer cambios al cliente. Cutover el 5-ago. ¿Aprobado?

### R2 · Duración total hasta MVP vendible

Con las fases 1 + 2 = **10-14 semanas**. Realista con un equipo dedicado. ¿Este ritmo es el correcto, o hay presión comercial que exige acelerar (con costo en deuda técnica) o desacelerar (con riesgo de que se enfríe el momentum)?

### R3 · MVP público vs beta cerrado

Opciones:
- **Beta cerrada** con 5-10 tenants amigos → aprender antes de anunciar.
- **Public launch** al terminar Fase 2 → captar mercado antes que competidores.

Recomendación: beta cerrada primero, público al mes 4 con casos de estudio.
