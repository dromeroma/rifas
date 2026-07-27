# 00 · Visión

## Qué ES Savvy Perks

Un **sistema operativo de fidelización** que le da a cualquier empresa —del ISP al restaurante, del gimnasio a la clínica— la infraestructura para hacer que sus clientes **vuelvan más, compren más y se conviertan en embajadores**.

El centro absoluto del sistema es **el cliente**, no el producto que la empresa vende.

Cada empresa (tenant) obtiene:
- Un **perfil rico de cada cliente** (identidad + comportamiento + preferencias + wallet).
- Una **wallet digital** por cliente con puntos, cupones, cashback, insignias, tickets, gift cards, recompensas.
- **Reglas** ("cuando X, entonces Y") que reaccionan a lo que hacen los clientes en el mundo real.
- **Campañas** dirigidas por segmento y comportamiento.
- **Gamificación** (niveles, retos, logros) para volver adictiva la relación.
- **Analítica** con KPIs de retención, LTV y churn.
- **Recompensas** universales: internet gratis, un café, un descuento, una gift card, una boleta de rifa.

Savvy Perks vive en la intersección de **CRM + Loyalty + Gamification + Marketing Automation + Analytics**, con la simplicidad de un producto de consumo y la potencia de una plataforma B2B.

---

## Qué NO es

Definir el **NO** es tan importante como el **SÍ**. Estas son las cosas que Savvy Perks **no será nunca**:

- **No es un software vertical.** No es "software para restaurantes" ni "software para ISPs". Es una plataforma horizontal que sirve a cualquier vertical porque el customer es universal.
- **No es un software de rifas.** Las rifas existentes se convierten en **un módulo** de recompensas y campañas. No son el centro.
- **No es un software de puntos.** Los puntos son solo una de N mecánicas. Un cupón, un cashback, una insignia o una experiencia también son "perks".
- **No es un ERP, POS, ni facturador.** Se integra con esos productos (empezando por el ecosistema Savvy) pero no compite con ellos.
- **No es un canal de comunicación.** No reemplaza WhatsApp, ni email, ni SMS. **Los orquesta** vía el Notification Engine.
- **No es un dashboard.** Es una experiencia. Cada pantalla debe sentirse como un producto de consumo, no como una hoja de cálculo.

**Filtro maestro** (aplica a toda decisión de producto):

> **¿Esta funcionalidad ayuda a que el cliente vuelva?**
> Si la respuesta no es un sí evidente y medible, no pertenece al producto.

---

## Contra qué competimos

| Competidor | Fuerza | Debilidad que explotamos |
|---|---|---|
| **Fidelity / LoyaltyLion / Yotpo Loyalty** | Marca internacional, integraciones con Shopify | Verticalizados a ecommerce. Precio en USD. No latinoamericanos. |
| **Beans (LATAM)** | Presencia regional | Foco en ecommerce; UX 2018. Sin gamificación real. Sin AI. |
| **Rappi Prime / Cornershop rewards** | Reach masivo | Cerrados a su vertical. No son plataforma vendible. |
| **Puntos Colombia / LifeMiles** | Escala | Legacy, cerrados, sin API. No abarcan PYMEs. |
| **Sistemas caseros (Excel, cuadernos, WhatsApp)** | Costo cero, adopción alta | Todo. Este es el competidor real del 90% del mercado. |

**Nuestra apuesta de posicionamiento**: el primer sistema operativo de fidelización **latinoamericano, multi-vertical, API-first y con AI aplicada al negocio real**. Precio en pesos, soporte local, integración con métodos de pago y canales latinos (Nequi, Daviplata, WhatsApp Business).

---

## North Star Metric (propuesta)

**Repeat Rate promedio** entre los tenants activos.

Definición: `clientes que hicieron 2+ acciones registradas en Perks en 30 días / clientes activos en el mismo período`.

Por qué esta y no otras:
- Alinea el éxito nuestro con el éxito del cliente del tenant.
- Es indiferente a la vertical (funciona igual para un ISP y para un restaurante).
- Sube solo si el producto genera comportamiento real, no si "hay más usuarios registrados".

Métricas secundarias que vigilamos:
- **Rewards Redeemed / Rewards Issued** (efectividad de las recompensas)
- **Rule Firings** por tenant (adopción del motor de reglas)
- **NPS del admin** (tenant satisfaction)
- **Churn de tenants** (retención del SaaS mismo)

---

## Diferenciadores no-negociables

1. **Multi-tenant y API-first desde el día 1.** Cualquier empresa se integra en horas, no en semanas.
2. **Cero fricción para el cliente final.** Todo se activa por evento; el cliente no tiene que "abrir una app" para ganar.
3. **Reglas visuales sin código** (V2). El admin arma "si X, entonces Y" con drag-drop.
4. **Latam-first.** Nequi, Daviplata, PSE, Wompi, MercadoPago. WhatsApp como canal principal.
5. **Gamificación como default**, no como plugin. Niveles y logros salen por defecto en cada tenant.
6. **Modo consumidor** (V2/V3): una wallet única del cliente que ve **todas sus recompensas de todas las empresas** que use Perks.

---

## Ecosistema Savvy

Perks es un producto independiente que **puede vivir sin el ecosistema Savvy**, pero cuando el tenant también usa Savvy POS, Savvy Water u otros, la integración es nativa:

- **Savvy Identity** (SSO) — un login para todo el ecosistema.
- **Savvy Bus** (event bus interno) — POS emite `sale.completed`, Perks lo consume, la wallet suma puntos automáticamente.
- **Savvy Customer Graph** — misma identidad de cliente compartida entre productos del ecosistema (opt-in por tenant y por cliente).

Ver [`03-ARCHITECTURE.md`](03-ARCHITECTURE.md) para detalles.

---

## 🚦 A validar contigo

Estas son las decisiones fundacionales que cambian todo. Necesitamos cerrarlas antes de escribir arquitectura fina.

### V1 · ¿Multi-vertical desde MVP o vertical-first?

**Tu decisión declarada**: multi-vertical desde MVP (ISP, restaurantes, tiendas, veterinarias, hoteles, etc.).

**Cuestionamiento honesto**:
> El error clásico de startups B2B es "para todos". Multi-vertical desde MVP nos obliga a construir todo genérico y a vender con demos abstractas. Los founders que ganan (Toast, Square, Shopify, Rappi) empezaron **hiper-verticales** y expandieron.
>
> Recomiendo: **arquitectura multi-vertical desde el diseño**, pero **enfoque comercial en 2–3 verticales para MVP**. Propuesta:
> - **Restaurantes / cafés / bares** (alta frecuencia, LTV visible, WhatsApp nativo)
> - **Gimnasios / peluquerías / barberías** (suscripción implícita, gamificación natural)
> - **Rifas / promotores de eventos** (ya lo tenemos, nos da caso de uso real desde día 1)
>
> Con esos 3 salimos, generamos ingresos, aprendemos, y expandimos con evidencia. La plataforma sigue siendo horizontal — solo el go-to-market se enfoca.

**Opciones**:
- **A** Multi-vertical desde MVP (tu propuesta original).
- **B** ✨ Enfoque comercial en 3 verticales para MVP, arquitectura horizontal. *(recomendación del equipo)*
- **C** Vertical único (solo restaurantes o solo rifas + eventos).

### V2 · ¿Consumer Wallet (B2C) desde qué fase?

**Escenario**: hoy es 100% B2B (el tenant es la empresa). En algún punto puede existir una **app del cliente final** que agregue perks de todas las empresas donde compra.

Esto es enorme —tipo Fidelity, LifeMiles o Rappi Prime pero abierto—. Cambia el modelo de negocio (network effects, monetización directa al consumidor, marketplace de perks).

**Opciones**:
- **A** Nunca. Somos B2B puro.
- **B** V2 (6–12 meses): wallet PWA embebida que el tenant activa opcionalmente.
- **C** ✨ V3 (12+ meses) como **producto independiente** ("Savvy Wallet") con marca propia y monetización separada. *(recomendación del equipo)*

### V3 · Rifas como módulo — ¿cómo migramos lo actual?

Hoy Boletera es el producto entero. Mañana es un módulo `perks-raffles`.

**Riesgo**: al migrar podemos romper clientes activos (Rifas El Golazo tiene sorteo el 4 de agosto).

**Recomendación**: freeze de cambios en la app de rifas hasta después del 4-ago-2026. Migración de código a módulo la hacemos en paralelo, en la rama nueva. Cutover el 5-ago.

**Confirmar**: ¿te parece esa ventana o hay eventos posteriores?

### V4 · Nombre del sistema — Savvy Perks confirmado, ¿del repo?

- **Producto**: Savvy Perks. Confirmado.
- **Dominio**: `perks.savvytrix.com`. Confirmado.
- **Repo GitHub**: hoy es `dromeroma/rifas`. ¿Lo renombramos a `savvy-perks`? Puede romper CI/webhooks. Alternativa: dejar el repo con nombre técnico y solo cambiar el `name` en README/package.json.

**Recomendación**: renombrar a `savvy-perks` (los redirects de GitHub se mantienen automáticamente y evitamos legacy naming eterno).
