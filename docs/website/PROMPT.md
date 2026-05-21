# Prompt para construir el sitio web de Boletera (proyecto separado)

> Este prompt está pensado para cuando se decida sacar el sitio marketero a un
> proyecto aparte (Next.js + Vercel, Astro o similar) para mejorar SEO,
> velocidad y poder iterar el marketing sin tocar la app.
>
> **Mientras tanto, la landing vive dentro de la misma app Angular en `/`
> ([landing.component.ts](../../frontend/src/app/features/landing/landing.component.ts)).**

---

## Contexto

Estás construyendo el sitio web de marketing de **Boletera**, una plataforma
SaaS que vuelve cualquier rifa en un negocio profesional. La app principal
(producto) ya existe en Angular en `https://rifas-beta.vercel.app`. Este sitio
es solo el frente público para conseguir leads.

**Stack sugerido:**
- Next.js 15 + React 19 (App Router, RSC)
- TailwindCSS 4
- Deploy en Vercel
- Contenido en MDX (para iterar copies sin redeploy de código)
- Form de contacto a través de Resend (mismo proveedor que ya usa la app)

**Dominio:** `boletera.app` (o `boletera.co` cuando se registre).
**Subdominio app:** `app.boletera.app` (apunta al Angular existente).

---

## Identidad de marca (resumen)

Lee [BRANDING.md](./BRANDING.md) completo antes de empezar.

- **Slogan principal:** *Tu rifa, profesional desde el primer ticket.*
- **Slogan secundario:** *Vender rifas, sin perder cuentas.*
- **Audiencia:** organizadores de rifas en Colombia / LATAM (200–500 boletas).
- **Voz:** profesional, cercana, colombiana sin folclorismos.
- **Paleta:** verde esmeralda `#1e8e54`, dorado `#f5b400`, carbón `#0b1116`.
- **Tipografía:** Inter (Google Fonts).
- **Modo oscuro como default** (la app del producto ya lo usa). Modo claro disponible.

---

## Estructura del sitio (páginas)

1. **`/` — Home / Landing**
   - Hero con headline + tagline + CTA "Empieza gratis".
   - Sección "Cómo funciona" con 4 pasos visuales.
   - Beneficios en grid (6 cards con íconos).
   - Demo visual de una boleta con QR (mismo mock que la landing actual).
   - Sección "Para quién" (organizadores, vendedores, clientes).
   - Testimoniales (placeholder hasta tener reales).
   - Pricing (por ahora: "Beta gratis, déjanos tus datos").
   - FAQ.
   - CTA final.

2. **`/precios` — Pricing**
   - Plan único en beta: gratis hasta cierta cantidad.
   - Tabla comparativa: Excel vs Boletera.
   - "Empieza ahora" → form.

3. **`/funcionalidades` — Features detalladas**
   - Boletas únicas inmutables (con código `XXX-XXX-XXX`).
   - Comisiones escalonadas (tier calificador) con ejemplo numérico.
   - Pagos con comprobante + workflow de aprobación.
   - Verificación pública por QR.
   - Auditoría y trazabilidad.
   - Notificaciones por email (Resend).
   - Mobile first.

4. **`/blog` — (placeholder)**
   - Posts MDX con SEO local: "Cómo organizar una rifa profesional",
     "Cuántas boletas debo poner en mi rifa", etc.

5. **`/contacto` — Formulario**
   - Nombre, email, teléfono, "cuéntame de tu rifa".
   - Envía a Resend → email a deimerromeromadera@gmail.com.

6. **`/legal/terminos`**, **`/legal/privacidad`** — Legales.

---

## Componentes clave a construir

| Componente | Notas |
|---|---|
| `<Nav>` | Sticky, transparente con blur. Logo + links + CTA primario. |
| `<Hero>` | Title clamp, gradient background sutil, mock de boleta inclinada. |
| `<FeatureCard>` | Icon (Material/Lucide), título, body, hover lift. |
| `<HowItWorks>` | Stepper vertical con número grande, título, descripción. |
| `<TicketMock>` | Componente React que renderiza una boleta de ejemplo (numbers, QR placeholder, code). |
| `<CTASection>` | Card grande con gradient + headline + botón. |
| `<Footer>` | Logo, slogan, links legales, copyright + "Hecho en Colombia". |

---

## Animaciones y micro‑interacciones

- Hero: fade‑in del título, ticket que rota 3° on load.
- Feature cards: hover lift 2px + border color → accent.
- Scroll progress en nav.
- Reveal on scroll para secciones (intersection observer).
- **No abusar** — el producto vende por orden y profesionalismo, no por bling.

---

## SEO

**Title:**
> Boletera · Tu rifa, profesional desde el primer ticket

**Description:**
> Boletera convierte cualquier rifa en un negocio profesional. Boletas únicas
> con QR, comisiones automáticas, pagos con comprobante y verificación pública.
> Hecho en Colombia.

**Keywords objetivo (long tail):**
- "software para administrar rifas"
- "app para rifas con boletas QR"
- "cómo organizar una rifa profesional"
- "plataforma de rifas Colombia"
- "comisiones para vendedores de rifas"
- "verificar boleta de rifa por código"

**Open Graph image:** mock de la app + slogan grande. 1200×630.

---

## Performance / accesibilidad

- Lighthouse target: Performance > 95, SEO 100, A11y > 95.
- LCP < 1.5s.
- Imágenes: AVIF / WebP, `next/image`.
- Fonts: `next/font/google` (preload, swap).
- Sin tracking scripts third‑party innecesarios.
- Cumplir AA WCAG.

---

## Contenido (copy listo para pegar)

### Hero

> # Tu rifa, profesional desde el primer ticket.
>
> Boletera convierte cualquier rifa en un negocio organizado: boletas únicas
> con QR, comisiones automáticas, pagos con comprobante y verificación pública.
> Sin Excel. Sin chats sueltos. Sin perder un peso.
>
> **[ Empezar gratis ]**  **[ Ver cómo funciona ]**
>
> *✓ Boletas únicas inmutables · ✓ Auditoría completa · ✓ Mobile first*

### Beneficios (6 cards)

1. **Boletas únicas con QR** — Cada boleta tiene un código irrepetible e inmutable. Tus clientes verifican en segundos.
2. **Comisiones escalonadas** — Configura tramos por boletas vendidas. El sistema recalcula automáticamente.
3. **Pagos con comprobante** — El vendedor sube la foto del pago. El admin confirma con un clic.
4. **Verificación pública** — Tus clientes verifican su boleta sin login. URL única + QR escaneable.
5. **Trazabilidad total** — Cada acción queda registrada. Quién reservó, quién pagó, quién confirmó.
6. **Funciona en celular** — Tus vendedores trabajan desde donde sea. Bottom‑nav móvil incluido.

### CTA final

> **Deja de administrar rifas con Excel y WhatsApp.**
>
> Empieza a vender con la confianza de un sistema profesional.

---

## Entregables esperados

1. Repo nuevo `boletera-website` deployable en Vercel.
2. Páginas: `/`, `/precios`, `/funcionalidades`, `/contacto`, `/legal/*`.
3. CMS lite con MDX para iterar copy.
4. Form de contacto funcional (Resend).
5. Open Graph + Twitter cards para todas las páginas.
6. Sitemap + robots.txt.
7. README con instrucciones de deploy y edición de contenido.

---

## Restricciones

- **No reinventar identidad de marca.** Seguir [BRANDING.md](./BRANDING.md) al
  pie de la letra.
- **No prometer features que no existen** en la app (`rifas-beta.vercel.app`).
- **El CTA principal lleva a `https://app.boletera.app`** (= la app Angular).
- **No usar imágenes stock de billetes** ni gente "feliz con dinero". Vulgar.
- **No traducir el producto al inglés.** Por ahora 100% en español.
