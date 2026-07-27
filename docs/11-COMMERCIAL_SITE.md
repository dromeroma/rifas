# 11 · Sitio Web Comercial (savvyperks.com / perks.savvytrix.com)

Brief creativo + technical spec del sitio comercial de Savvy Perks. No es el producto — es la puerta de entrada al producto.

Meta: cuando alguien llegue por primera vez, en los primeros 8 segundos debe pensar **"esto se ve mejor que lo que usa mi competencia"** y en los primeros 60 segundos, **"quiero una demo".**

---

## Filosofía

El sitio comercial es una promesa visual. Si el sitio se ve amateur, el prospecto asume que el producto también lo es. Si se ve premium, se prepara para pagar bien.

Referencias intencionales para el nivel visual:

- **Linear.app** — jerarquía perfecta + motion sutil + oscuro cuidado.
- **Stripe.com** — densidad de información sin sobrecarga, code snippets como decoración funcional.
- **Vercel.com** — hero premium con animación viva + secciones bien ritmadas.
- **Framer.com** — motion como storytelling.
- **Superhuman.com** — tipografía como diferenciador, promesas cuantificadas.
- **Notion.so** — friendly + profesional al mismo tiempo.
- **Rippling.com** — buen ejemplo de plataforma multi-módulo B2B.
- **Duolingo.com** — celebratorio con contención, no infantil.

Anti-referencias:
- Sitios "wow con parallax pero sin sustancia" — no.
- Landing con 15 secciones idénticas de "features y beneficios" — no.
- Copy corporativo tipo "empodera a tu negocio con soluciones innovadoras" — nunca.

---

## Público (buyer personas)

**1. El dueño operativo de un negocio LATAM** (restaurante, gym, tienda, ISP pequeño).
- 30–55 años.
- No es tech-savvy. Sabe lo que necesita pero no habla API.
- Le duele: perder clientes, no saber cuáles vuelven, competir con cadenas grandes.
- Necesita: entender el ROI en 30 segundos. Ver que otros como él ya lo usan. Precio claro. Botón de "hablar con humano".

**2. El gerente de marketing / CX** de una empresa mediana.
- 25–40 años.
- Habla el lenguaje "retención, LTV, journeys".
- Le duele: sistema fragmentado (Excel + WhatsApp + POS + email marketing distinto).
- Necesita: ver que Perks es una plataforma, no un plugin. API + integraciones. Casos concretos.

**3. El fundador de otra startup / dev** que quiere integrar loyalty en su producto.
- 20–35 años.
- Habla webhooks, SDK, docs.
- Le duele: soluciones "todo o nada" que no se integran a su stack.
- Necesita: link a docs de API. Ejemplos de código. Free tier o billing transparente.

Cada sección del sitio debe hablarle a al menos uno de los tres.

---

## Value proposition (headline)

**Propuesta principal** (a iterar con testeo):

> **Convierte cada cliente en un cliente recurrente.**
> Savvy Perks es la plataforma de fidelización, gamificación y CRM que hace que tus clientes vuelvan más, gasten más y traigan más.

**Sub-hero**:
> Wallet digital, puntos, cupones, retos y recompensas. Todo en un producto que se conecta a lo que ya usas: WhatsApp, Nequi, tu POS, tu ecommerce.

**Variaciones para A/B**:

- "El sistema operativo de tus clientes. Fidelización que funciona sola."
- "Puntos, cupones, cashback, rifas y retos. En una plataforma que tu equipo ama."
- "Del cliente ocasional al cliente que trae a sus amigos."

Regla: nunca abrir con "Bienvenido a…" ni con lista de features. Siempre con **lo que gana el negocio**.

---

## Arquitectura de información (secciones)

Estructura del landing principal en el orden en el que se scrollea.

### 1. Hero (above the fold)

- **Nav** flotante con: logo Savvy Perks + links (Producto · Módulos · Precios · Docs · Login) + CTA primario "Probar gratis" + CTA secundario "Ver demo".
- **Headline** grande, precisa.
- **Sub-hero** con la promesa expandida.
- **CTA doble**: "Empezar gratis 14 días" + "Agendar demo (20 min)".
- **Visual central**: componente animado que muestra una wallet de un customer subiendo puntos en tiempo real, con eventos que aparecen del lado ("compra confirmada +50 pts", "nivel Gold desbloqueado", "cupón enviado por WhatsApp"). Es la promesa vuelta demo.
- **Trust bar** debajo: logos de 3–6 marcas usando Perks. Al principio será "Rifas El Golazo" + placeholders. Se rota conforme cerramos clientes.

Densidad correcta: 1 mensaje, 1 visual, 2 CTAs. No más.

### 2. Cómo funciona en 3 pasos

Sección corta que reduce la ansiedad del "¿me servirá?".

- **1. Conecta lo que ya usas.** Iconos: POS, WhatsApp, Nequi, ecommerce, formulario. "En minutos, sin tocar código si no quieres."
- **2. Define reglas.** "Elige de plantillas o arma las tuyas: cumpleaños, primera compra, cliente inactivo, refiere y gana, y decenas más."
- **3. Tu cliente vuelve.** "Puntos, cupones, retos y recompensas. Sin apps que descargar. Sin fricción."

Cada paso con motion sutil al entrar al viewport (fade + translate 8px).

### 3. Módulos — el sistema operativo

Aquí mostramos los engines. Grid de 6 tarjetas visualmente distintas pero coherentes:

- 🧑 **Customer Engine** — Un perfil unificado de cada cliente. Historial, preferencias, wallet, insignias.
- 💰 **Wallet Engine** — Puntos, cashback, cupones, gift cards, boletas — una billetera por cliente.
- ⚡ **Rules Engine** — "Cuando X, entonces Y". Sin código, con drag-drop en V2.
- 🎁 **Rewards Engine** — Catálogo universal de recompensas, incluyendo internet, streaming, boletas de rifa.
- 🎮 **Gamification** — Niveles, retos, insignias, rachas. Adictivo con contención.
- 🤖 **AI Insights** — Riesgo de abandono, next-best-reward, mejor momento para escribir.

Cada tarjeta con micro-preview visual (mini widget). Hover expande a mini-explicación.

### 4. Casos de uso por vertical

Sección con tabs horizontales o pills:
- Restaurantes · Gimnasios · Tiendas · Barberías · ISPs · Rifas · Ecommerce · Otros

Al seleccionar, se ve un ejemplo concreto:

> **Restaurantes**
> Cada cliente que pide por delivery gana 10 puntos. A los 500, cena gratis. Recordatorio automático cuando llevan 20 días sin pedir. Cumpleaños, cupón en WhatsApp.
>
> [ Ver plantillas de restaurante → ]

Estos ejemplos hacen sentir "esto está pensado para mí".

### 5. Demo interactiva — Rules Engine

Un widget embebido en la página que **el visitante puede tocar**:

- Selecciona un evento del dropdown ("Compra sobre 50K").
- Selecciona una condición ("Cliente nivel Bronce o Plata").
- Selecciona una acción ("+50 puntos + WhatsApp de felicitación").
- Preview del JSON generado + previsualización de "así se le vería al cliente".

Es la sección que convierte al comprador dubitativo — permite tocar sin comprometerse.

### 6. Integraciones

Grid de logos (con detalle al hover):
- **Canales**: WhatsApp Business, Email, Push, SMS.
- **Pagos**: Wompi, Nequi, Daviplata, Mercado Pago, PSE.
- **Ecommerce**: Shopify, WooCommerce, custom via API.
- **POS**: Savvy POS, integraciones abiertas.
- **CRM**: HubSpot (V2), Zapier/Make (V2).
- **Otros SaaS del ecosistema Savvy**.

CTA: "¿No ves tu sistema? Cuéntanos, lo evaluamos." → captura de lead.

### 7. Social proof / testimonials

Al principio será modesto (Rifas El Golazo, referencias del founder). Diseño premium igual:

- Cifras destacadas (cuando existan): "3x más ventas repetidas", "45% de clientes reactivados", "$50M distribuidos en recompensas". Nunca inventar.
- Testimonios en formato tarjeta con foto + nombre + cargo + logo empresa.
- Video testimonial cuando lleguemos a tenerlo.

### 8. Precio

Tres tiers, claros, con "más popular" marcado:

- **Starter** — $/mes — para pequeños negocios. Hasta X customers.
- **Growth** — $/mes — para negocios en crecimiento. Hasta Y customers + integraciones.
- **Business** — $/mes — sin límite, con AI + gamificación completa + SLA.

Debajo:
- **Enterprise** — "Hablemos" con calendario embebido.

Toggle mensual / anual (con descuento).

Comparativa simple ("qué incluye cada plan") con checkmarks. Sin celdas vacías — cada feature dice claramente qué obtiene cada tier.

Reglas de UX: **precio en pesos**. **Sin sorpresas** ("empieza gratis, sin tarjeta"). **CTA claro** por plan.

### 9. Para desarrolladores

Sección corta pero premium para el buyer #3:

- Snippet de código (`curl` con el API).
- Link a docs.
- Mención de webhooks + widgets embebibles + SDKs (roadmap).
- CTA: "Ver API docs" + "Únete al Discord de devs" (cuando exista).

### 10. Preguntas frecuentes

10-12 preguntas reales, respuestas directas:
- ¿Necesito app móvil para mis clientes?
- ¿Se integra con mi POS?
- ¿Cuánto tiempo toma implementar?
- ¿Y si mi negocio no está en la lista?
- ¿Y si me quiero ir?
- Precio en pesos y facturación con IVA.
- Datos y privacidad (mención de Habeas Data).
- Soporte en LATAM.
- Migración desde Excel / otro sistema.
- Roadmap público.

### 11. CTA final — footer transition

Sección "closing" con headline nueva:

> **Tus clientes ya están listos para volver. Falta que se lo hagas fácil.**

CTA doble grande. Fondo distinto — momento visual de peso.

### 12. Footer

- Links a: Producto, Módulos, Casos de uso, Precios, Docs, Blog (V2), Legal, Contacto.
- Ecosistema Savvy: Savvy POS · Savvy Water · Savvy Memorial · Savvy Perks (activo).
- Redes.
- "Hecho con ❤ en Colombia."
- Copyright + Términos + Privacidad + Habeas Data.

---

## Sistema visual del sitio

Reusa los tokens de [`10-UI_GUIDELINES.md`](10-UI_GUIDELINES.md) con estos ajustes premium para landing:

### Paleta específica del sitio

Base sobre los tokens del producto, pero con detalles de "brand marketing":

- **Fondo oscuro dominante** (mode principal del landing). Ver landing de Vercel/Linear como referencia.
- **Modo claro disponible** — no es obligatorio en el sitio, se puede empezar solo dark.
- **Acento cálido dorado/verde vivo** para CTAs y highlights.
- **Superficies con gradientes sutiles** en secciones específicas — nunca mezcla arcoíris.

### Tipografía

- **Display**: fuente distinta al producto para el hero — `Instrument Serif`, `Fraunces` o `IBM Plex Serif` para dar toque editorial premium. A validar con opciones concretas.
- **Sans**: la misma del producto (Inter) para consistencia.
- **Mono**: para code snippets.

Regla: máximo 3 tamaños de headline en el sitio (hero, section, subsection). Sin caos tipográfico.

### Motion (más generoso que en el producto)

En el landing sí nos permitimos:
- **Scroll-triggered animations** sobrias en cada sección al entrar al viewport.
- **Cursor parallax sutil** en el hero.
- **Números en rolling** cuando aparecen KPIs.
- **Preview interactivo** del Rules Engine con transiciones fluidas.
- **Micro-partículas** en el CTA final (moderación, no fiesta de emojis).

Respeto absoluto a `prefers-reduced-motion`.

### Imagenería

- **Product screenshots reales** — nada de mockups fake. Cuando el producto no esté, usamos ilustraciones vectoriales premium (estilo Linear).
- **Ilustraciones** — vectoriales, isométricas suaves, coherentes con brand. **Contratamos ilustrador** para 6-10 piezas clave (hero, empty states, sección de módulos, celebración).
- **Fotos** — evitar stock genérico. Preferir foto original de clientes reales (con permiso) cuando llegue el momento.

---

## Copy — voz y ejemplos

Reglas del copy comercial:

**Reglas**:
- **Frases cortas**. Ideal 6–12 palabras.
- **Segunda persona (tú)**. Le hablamos al negocio, no a "los negocios".
- **Números concretos**. "3x más ventas", "5 minutos para arrancar", no "significativamente más".
- **Sin marketing hueco**. Cero adjetivos comodín ("innovador", "líder", "de vanguardia").
- **Español natural LATAM**. Nada de "empowerment" ni "engagement" sin traducción.

### Ejemplos de copy propuesto

**Hero (opción principal)**:
> Convierte cada cliente en un cliente recurrente.
> Savvy Perks es la plataforma de fidelización, gamificación y CRM que hace que tus clientes vuelvan más, gasten más y traigan más.

**Módulo Rules Engine**:
> **Reglas que trabajan por ti.**
> Cuando alguien cumple años, cuando lleva 30 días sin comprar, cuando llega a nivel Gold. Elige de nuestra biblioteca o arma la tuya.

**Módulo AI Insights**:
> **La IA que sabe cuándo vas a perder un cliente.**
> Y qué recompensa dárselo para que se quede. Sin drama, con datos.

**CTA final**:
> Tus clientes ya están listos para volver.
> Falta que se lo hagas fácil.

**FAQ (ejemplo)**:
> **¿Necesito una app móvil para mis clientes?**
> No. Todo funciona por WhatsApp, email o SMS. Tus clientes reciben sus beneficios sin descargar nada. Opcional: la web wallet para consultar puntos y retos.

---

## SEO — estrategia base

MVP del sitio necesita rankear rápido para queries comerciales relevantes en LATAM:

- **Queries objetivo primarias**: "software fidelización", "sistema de puntos para clientes", "programa lealtad Colombia", "software CRM restaurantes", "wallet digital cliente", "sistema recompensas Nequi".
- **Queries objetivo long-tail**: "cómo hacer un programa de fidelización", "loyalty para restaurante en Colombia", "sistema de puntos con WhatsApp".

**Tácticas**:
- **URL structure limpia**: `/`, `/producto`, `/modulos/wallet`, `/casos/restaurantes`, `/precios`, `/docs`, `/blog/*`.
- **Meta tags únicos** por página con datos estructurados (JSON-LD tipo `Product`, `SoftwareApplication`, `Organization`).
- **Sitemap.xml + robots.txt** correctos.
- **Open Graph** perfecto para compartir en WhatsApp/redes.
- **Perf: LCP < 1.5s, CLS < 0.1**. Cloudflare + Astro + assets optimizados.
- **Blog** (V2) con posts técnicos y de dominio ("Cómo un restaurante en Barranquilla aumentó su recurrencia en X%").
- **Backlinks** buscados vía partnerships con Nequi, Wompi, cámaras de comercio, medios locales.

---

## Tech stack propuesto para el sitio

Decisión crítica. Cuestiono el stack por defecto y propongo:

### Opción A — Astro standalone (recomendación)

Repo: mismo (`apps/marketing/`) pero build y deploy separados de la app.

- **Astro** + **MDX** para páginas y blog.
- **Tailwind** con tokens del producto reflejados.
- Componentes interactivos (`RulesEngineDemo`, `WalletPreview`) como islands Astro con React o Vue mínimo — o directamente vanilla JS con Web Components.
- Deploy a Cloudflare Pages standalone (distinto Worker que el producto).
- Contenido en Markdown → equipo no-técnico puede editar textos vía PR sencillo o CMS ligero (Sanity, Contentlayer o simplemente Markdown en Git).

**Por qué**:
- **SEO y performance**: Astro genera HTML estático — LCP milagroso.
- **Independiente del ciclo del producto**: el sitio puede iterar semanalmente sin tocar la app.
- **Contenido en MD**: barrera baja para editar textos.
- **Motion premium**: podemos usar Motion One / Framer Motion sin peso en la app.

### Opción B — Angular en el mismo repo (`apps/marketing/`)

- Reusa build pipeline y componentes del producto.
- Consistencia perfecta con la marca.
- **Peor SEO** (SPA) — se puede mitigar con SSR/prerender, pero es más trabajo.
- Deploys atados al ciclo del producto.

### Opción C — Framer / Webflow

- Rápido, no-code.
- Mala performance, mal SEO, dependencia externa.
- **Descartado** para producto que quiere verse premium.

**Recomendación**: **Astro** (Opción A). Mantiene el stack de producto intocado, gana en SEO y velocidad de iteración, y el sitio se ve "hecho a mano" en el mejor sentido.

---

## Analítica y tracking

Herramientas propuestas:

- **Analytics de producto**: Plausible o PostHog (privacy-first, no Google Analytics).
- **Attribution**: UTMs disciplinados en cada anuncio y link externo.
- **A/B testing**: PostHog Feature Flags o Cloudflare Workers para variantes.
- **Session recordings**: PostHog para casos calientes (con consent).
- **Heatmaps**: PostHog o Hotjar.

Métricas del sitio a vigilar semanalmente:
- Visitantes únicos.
- Conversión a demo booking / trial signup.
- Tiempo en Rules Engine demo.
- Cliks en "Precios".
- Origen (SEO, ads, referrals, direct).

---

## Roadmap del sitio

### Fase 0.5 — Landing "coming soon premium" con waitlist
**Duración**: 2 semanas después de decidir stack y contratar diseño.

- Hero + propuesta de valor + waitlist + calendario de demo.
- Secciones: Hero, Módulos (versión reducida), Verticales, Waitlist, Footer.
- **Sin pricing público todavía**.
- Meta: capturar 100+ leads antes del MVP del producto.

### Fase 1 del sitio — Full landing pre-launch
Coincide con el arranque del MVP del producto (Fase 2 del roadmap general).

- Todas las secciones listadas arriba.
- Precios públicos.
- Demo interactivo del Rules Engine.
- Casos de uso reales (mínimo 1).
- Blog activo con 3-5 posts.

### Fase 2 del sitio — SEO growth
Después del MVP público.

- Blog escalado a 1 post semanal.
- Landing pages por vertical (`/para-restaurantes`, `/para-gimnasios`, ...).
- Case studies como página dedicada por cliente destacado.
- Docs públicas con estilo premium (referencia: Vercel, Cloudflare, Stripe).

### Fase 3 — Ecosistema
Post V2/V3 del producto.

- Portal de partners.
- Marketplace de plantillas de reglas y campañas.
- Consumer Wallet como marca separada con landing propio.

---

## Decisiones cerradas (2026-07-26)

Founder firmó las 6 decisiones del sitio comercial. Estas quedan como contrato de trabajo — cualquier cambio abre ADR.

### C1 · Dominio final del sitio comercial → `perks.savvytrix.com`

**Decisión**: mantener `perks.savvytrix.com` por ahora. El producto y el sitio comercial cohabitan en el mismo host:
- `/` → sitio comercial (marketing).
- `/app/…` o subdominio interno para el producto (a decidir en Fase 1 sin urgencia).

**Consecuencia**: no compramos dominio nuevo. Ahorro de tiempo. Camino a `savvyperks.com` queda abierto para V2 sin bloquear nada.

**Nota técnica**: el sitio de marketing (Astro) y la app (Angular) comparten dominio pero se sirven desde builds/deploys separados en Cloudflare — cada uno con su Worker/Pages.

### C2 · Marca visual → identidad propia de Perks anclada a Savvy

**Decisión**: identidad visual dedicada para Perks — logo propio, color propio, tono propio — pero con parentesco visible con el ecosistema Savvy. Modelo mental: Meta ↔ Instagram, no Google ↔ Search.

**Consecuencia**: cuando arranquemos el diseño del sitio (Fase 0.5), lo primero es definir:
- Sistema de color de Perks (base + acento cálido) que dialogue con Savvy.
- Wordmark "Savvy Perks" con jerarquía tipográfica clara.
- Iconografía y estilo ilustrativo consistente entre productos.

### C3 · Idioma → español LATAM en MVP; multilenguaje después

**Decisión**: MVP del sitio y del producto salen **solo en español LATAM**.

**Roadmap declarado del founder**: agregar en fases posteriores:
- 🇬🇧 **Inglés** (mercado hispano-US + LATAM tech + inversión internacional).
- 🇧🇷 **Portugués** (Brasil — el mayor mercado LATAM por PIB).
- 🇫🇷 **Francés** (Canadá + Norte de África — mercado subestimado).

**Consecuencia técnica no negociable** (aunque no se implemente ya): todo copy del sitio y del producto vive desde el día 1 en **archivos de contenido separados** (JSON/YAML o `.md` por locale). Nada de strings hardcodeados en componentes.

Estructura propuesta:

```
apps/marketing/
├── src/
│   ├── content/
│   │   ├── es/
│   │   │   ├── home.md
│   │   │   ├── modules.md
│   │   │   ├── verticals.md
│   │   │   └── faq.md
│   │   ├── en/    (V2 — vacío por ahora)
│   │   ├── pt/    (V3)
│   │   └── fr/    (V4)
│   └── i18n/
│       ├── es.json    (strings de UI del sitio)
│       └── ...
```

Esto convierte "internacionalizar" en un trabajo de traducción, no de refactor. El costo hoy de armarlo así es ~15 minutos; el costo mañana de retrofitear es ~2 semanas.

En el producto (Angular) se aplica el mismo principio: `@ngx-translate/core` o Angular i18n nativo desde el arranque de Fase 1, con solo el locale `es-CO` activo. Todo texto pasa por `t('key')`, nunca hardcodeado.

### C4 · Fase 0.5 → waitlist + booking de demo

**Decisión**: la captura de leads en la fase premium tiene ambos:
- **Waitlist** para prospectos que aún no están listos para agendar (barrera baja).
- **Booking de demo** vía Cal.com o Calendly embebido para prospectos calientes (agenda pipeline real).

**Consecuencia**: dos CTAs coexisten. Diseño diferencia claramente "Únete a la lista" (secundario) vs "Agenda tu demo" (primario para prospectos calificados).

Infra necesaria en MVP: tabla `waitlist_leads` en Postgres (email, teléfono opcional, empresa, vertical, origen UTM, timestamp) + integración de Cal.com (link embebido, webhook a `platform.lead.demo_booked`).

### C5 · Diseñador → Claude actuando como Senior Product Designer

**Decisión**: no contratamos diseñador externo. Cuando llegue Fase 0.5, actúo como **Senior Product Designer con especialización en SaaS premium**.

**Qué significa esto operativamente**:
- El diseño se produce **directamente en código** (HTML/CSS con tokens + componentes Astro). No hay ida y vuelta a Figma.
- Ventaja: iteración instantánea. Cada mockup es ya un prototipo real, servible.
- Trabajo en pasadas: v1 wireframe navegable → v2 con tipografía y color final → v3 con motion e ilustraciones vectoriales → v4 pulido premium.
- Cada pasada se sube a un subdominio de preview (`preview-perks.savvytrix.com`) para revisión visual antes de merge a main.

**Contrato de calidad**: cada pantalla debe pasar el filtro "¿se ve como Linear/Stripe/Vercel?". Si un componente se ve "correcto" pero no "excelente", se rehace.

**Ilustraciones**: SVG puro escrito a mano cuando el layout lo pida. Sin dependencias externas de librerías de ilustraciones (que se ven todas iguales).

**Dependencia razonable**: para **fotos originales** de clientes reales (cuando lleguen), sí se necesita fotógrafo/producción. Ese costo queda en el backlog para V2 del sitio, cuando el sitio esté validado.

### C6 · Copywriter → Claude actuando como Senior Copywriter LATAM

**Decisión**: no contratamos copywriter externo. Cuando llegue Fase 0.5, actúo como **Senior Copywriter con voz LATAM natural y experiencia en SaaS premium**.

**Qué significa esto operativamente**:
- Cada headline, subhead, CTA, párrafo de sección, microcopy y mensaje de estado se escribe **con criterio editorial senior**, no "traducido de inglés".
- Trabajo en pasadas: v1 mensaje esencial → v2 con voz y ritmo → v3 con testeo A/B implícito (2-3 variaciones por sección clave).
- Cada headline pasa por 3 versiones. La ganadora se justifica.

**Regla dura de estilo** (aplica a todo el copy del sitio y del producto):
- Frases cortas. 6–12 palabras es el rango ideal.
- Segunda persona directa ("Tú convierte", no "los negocios convierten").
- Números concretos, nunca vaguedades.
- Español LATAM natural — cero "engagement", "empoderamos", "soluciones". Palabras que un dueño de negocio dice en su día a día.
- Cero adjetivos comodín ("innovador", "vanguardia", "líder"). Se muestra, no se dice.

**Contrato editorial**: cada texto se prueba leyéndolo en voz alta. Si al leerlo se siente "corporativo", se reescribe.

---

## Consecuencias prácticas para el arranque de Fase 0.5

Con las 6 decisiones cerradas, el flujo de trabajo para arrancar el sitio queda así:

1. **Kickoff** de Fase 0.5 (post cutover de rifas, 5-ago-2026):
   - Definir sistema de color de Perks (paleta con anclaje visual a Savvy — 1 sesión).
   - Elegir tipografías (display + sans + mono — 1 sesión).
   - Wordmark de Perks (1 pasada + iteración).

2. **v1 del sitio** (semana 1):
   - Estructura Astro creada en `apps/marketing/`.
   - Content en español en `content/es/`.
   - Hero + Cómo funciona + Módulos (versión reducida) + Waitlist + Footer.
   - Preview desplegado en subdominio.

3. **v2 del sitio** (semana 2):
   - Motion en las secciones clave.
   - Ilustraciones SVG del hero y de "Módulos".
   - Integración Cal.com para booking de demo.
   - Integración PostHog/Plausible.
   - SEO base (meta tags, sitemap, OG, LD-JSON).

4. **v3 pulido y launch** (semana 3):
   - Auditoría de accesibilidad y perf (Lighthouse ≥ 95).
   - Auditoría editorial del copy completo.
   - Copy testeado en voz alta y ajustado.
   - Anuncio de launch a la red del founder.

Ninguna de estas semanas se hace hasta que ADR-006 permita el cutover de rifas.

## Presupuesto revisado (post decisiones)

| Ítem | Costo | Estado |
|---|---|---|
| Diseñador senior freelance | ~~USD 3–8k~~ → **USD 0** | Claude actúa como Senior Designer (C5) |
| Copywriter LATAM | ~~USD 300–1k~~ → **USD 0** | Claude actúa como Senior Copywriter (C6) |
| Desarrollo Astro landing | 2–3 semanas dev | interno |
| Dominio + hosting Cloudflare | USD 0 | ya cubierto (`perks.savvytrix.com`) |
| Cal.com | USD 0 en tier free | suficiente al inicio |
| PostHog / Plausible | USD 0 en tier free | suficiente al inicio |
| Fotos/videos originales | USD 0 | backlog para V2 del sitio |
| **Total Fase 0.5** | **~USD 0** | inversión en tiempo, no en dinero |

Trade-off asumido: velocidad y control absoluto a cambio de la iteración humana de un tercero. Si en algún momento el resultado no pasa el filtro "se ve como Linear/Stripe", el founder puede reabrir C5/C6 y contratar externamente.

---

## Presupuesto orientativo del sitio (Fase 0.5)

| Ítem | Costo estimado | Notas |
|---|---|---|
| Diseñador senior freelance | USD 3–8k | Figma + ilustraciones + kit motion |
| Copywriter LATAM | USD 300–1k | 1 semana |
| Desarrollo Astro landing | 2 semanas dev | interno |
| Dominio + hosting Cloudflare | USD 0–20/año | ya cubierto |
| Calendly/Cal.com | USD 0–15/mes | tier free suficiente al inicio |
| PostHog / Plausible | USD 0–29/mes | tier free suficiente al inicio |
| Fotos/videos originales | USD 0–2k | opcional, para versión pulida |
| **Total Fase 0.5** | **~USD 3.5–11k** | inversión de una sola vez |

Esto no es lujo — es infraestructura de credibilidad. Un sitio amateur pierde 10x este monto en leads mal calificados.

---

## 🚦 A validar contigo

Las 6 preguntas de arriba (C1–C6) son las que necesitamos cerrar antes de arrancar el diseño. Recomendaciones marcadas ✨.

Adicionalmente:

### CS1 · Timing

¿Arrancamos Fase 0.5 del sitio en paralelo con Fase 1 del producto (recomendación), o esperamos a que el MVP del producto esté más maduro?

Recomendación: **paralelo**. Un mes de captación temprana con waitlist premium vale más que dos meses de silencio pre-launch.

### CS2 · Presupuesto

¿Autorizas la inversión inicial (~USD 3.5–11k) para diseño + copy? Sin esto, el sitio es "hecho por dev", no "hecho por estudio de diseño". La diferencia se nota.

### CS3 · Contenido inicial

Necesitamos:
- 1 caso real (empezar con Rifas El Golazo — con permiso, cifras reales).
- 3-5 testimonios cortos (aunque sean del founder al inicio, no inventados).
- Logos de 3-6 partners para trust bar (Nequi, Wompi, WhatsApp, otros con los que integramos).

¿Podemos ir gestionando esto en paralelo mientras arrancamos el diseño?
