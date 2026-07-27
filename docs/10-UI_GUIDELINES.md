# 10 · UI Guidelines

Reglas del sistema visual y de motion. No es un catálogo de componentes — es la constitución de cómo se ve y se siente Savvy Perks.

Meta: cuando un admin abre Perks debe pensar **"esto es un producto de consumo con superpoderes"**, no "esto es software empresarial".

---

## Espíritu del producto

Referencias intencionales:

- **Stripe** — densidad de información con jerarquía impecable.
- **Linear** — velocidad percibida + shortcuts + primer plano del trabajo.
- **Vercel** — dark mode nativo, tipografía precisa.
- **Notion** — bloques flexibles, sin celdas de tabla evidentes.
- **Arc Browser** — motion con significado.
- **Duolingo** — gamificación amable, celebratoria.
- **Mercado Libre** (mobile) — densidad LATAM correcta, colores vibrantes cuando aportan.

Anti-referencias:

- Salesforce, Oracle CRM, HubSpot (versión clásica) — pantallas llenas de datos sin jerarquía.
- Genéricos "material design" que sobrecargan de shadows y drawers.

---

## Tokens (design tokens)

Los tokens son la única fuente de verdad para color, tipografía, espaciado, radios, sombras. Nada de hex codes ni `px` inline en componentes.

### Color

Cada token existe en **light** y **dark**. Se aplican por CSS custom properties.

```
--surface-canvas          -- fondo global de la app
--surface-card            -- superficie de bloques y cards
--surface-elevated        -- popovers, dropdowns, modals
--surface-inset           -- inputs, code blocks
--border-subtle           -- separadores suaves
--border-strong           -- bordes activos, focus
--text-primary            -- texto principal
--text-secondary          -- texto de soporte
--text-muted              -- labels, hints
--text-inverse            -- sobre superficies fuertes

--brand-primary           -- acción principal (color Savvy)
--brand-primary-hover
--brand-primary-active
--brand-accent            -- highlights, badges

--state-success
--state-warning
--state-danger
--state-info

--focus-ring              -- outline de foco
```

**Regla**: si aparece un color en el diseño que no está en tokens, se agrega al token — no se usa suelto.

**Colores de brand Savvy** (a definir por el equipo — hay slot en tokens; no elegimos aquí):
- Verde/Azul característico Savvy: token `--brand-primary`.
- Acento cálido (dorado/naranja): token `--brand-accent`.

**Dark mode es no-negociable** desde MVP. Cada componente se prueba en ambos.

### Tipografía

```
--font-sans          -- Inter (mismo que hoy)
--font-mono          -- JetBrains Mono / Geist Mono para códigos, IDs
--font-display       -- variante display para heroes y hitos (opcional; Inter Tight funciona)

Escalas:
--text-xs   11px / 14
--text-sm   12px / 16
--text-md   13px / 18   ← base
--text-lg   15px / 22
--text-xl   18px / 26
--text-2xl  22px / 30
--text-3xl  28px / 36
--text-4xl  36px / 44
```

- Weights permitidos: 400 (regular), 500 (medium), 600 (semibold), 700 (bold). Extra-bold reservado para heroes.
- Numerales tabulares (`font-variant-numeric: tabular-nums`) por default en todo lo que muestre números en columnas.

### Espaciado

Escala base 4px:

```
--space-0   0
--space-1   2
--space-2   4
--space-3   6
--space-4   8
--space-5  12
--space-6  16
--space-7  24
--space-8  32
--space-9  48
--space-10 64
--space-11 96
```

No hay márgenes/paddings que no salgan de esta escala.

### Radios

```
--radius-xs  4
--radius-sm  6
--radius-md  10   ← base
--radius-lg  14
--radius-xl  20
--radius-full 999
```

### Sombras

Menos es más. Cuatro sombras cubren todo el sistema:

```
--shadow-xs   -- botones/inputs en hover
--shadow-sm   -- cards por default
--shadow-md   -- popovers
--shadow-lg   -- modals
```

Sombras respetan el modo (más ligeras en dark, con color-mix hacia el fondo).

### Focus

- Todo focus visible: outline 2px con offset 2px usando `--focus-ring`.
- Nunca eliminamos el outline. Sí lo estilizamos.

---

## Motion

Motion no es decoración — es **feedback + jerarquía + orientación espacial**.

### Timings

```
--motion-fast     120ms
--motion-base     200ms
--motion-slow     320ms
--motion-emphasis 480ms
```

### Easing

```
--ease-out       cubic-bezier(0.16, 1, 0.3, 1)   ← default
--ease-in        cubic-bezier(0.7, 0, 0.84, 0)
--ease-in-out    cubic-bezier(0.65, 0, 0.35, 1)
--ease-spring    cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Reglas

- **Aparición de elementos**: `--motion-base` + `--ease-out` (fade + 6-8px translate).
- **Desaparición**: `--motion-fast` + `--ease-in`.
- **Feedback de acción** (tap, press): `--motion-fast` con leve escala 0.98.
- **Celebración** (subir de nivel, ganar badge): motion con `--ease-spring` y micro-partículas — se puede excederse en 2-3 momentos icónicos, en el resto del producto se mantiene sobrio.
- **Respeto a `prefers-reduced-motion`**: obligatorio. Si el usuario lo activa, se cortan animaciones no esenciales.

### Micro-animaciones canónicas

- **Contador de puntos** al ganar: rolling number con delay staggered por dígito.
- **Progress bar de tier**: relleno con `--ease-out`, brillo suave al completar.
- **Badge nuevo**: entrada con spring + halo temporal 800ms.
- **Toast**: entra desde bottom-right, sale con fade + drop.

---

## Componentes core del design system

Cada uno de estos vive en `apps/web/src/app/shared/design/` como componente standalone Angular.

### Foundations
- `Button` (primary, secondary, ghost, danger; sizes sm/md/lg; con icon slot).
- `IconButton`.
- `Input`, `Textarea`, `Select`, `Combobox`, `DateRange`.
- `Checkbox`, `Radio`, `Switch`, `Toggle`.
- `Chip`, `Badge`, `Tag`.
- `Avatar` (con iniciales fallback, ring de tier opcional).
- `Tooltip`, `Popover`, `DropdownMenu`.
- `Dialog` (modal), `Sheet` (drawer lateral).
- `Toast` (sistema de notificaciones in-app).
- `Skeleton` (loading state).

### Data display
- `Card` (con `Card.Header`, `Card.Body`, `Card.Footer`).
- `DataTable` (con virtualización, sticky header, filtros expuestos, tabular numerals).
- `List` (denso, alterna con `DataTable` según densidad de info).
- `EmptyState` (ilustración + copy + CTA).
- `StatTile` (KPI cuadrado con label, valor, delta, sparkline opcional).
- `Timeline` (para wallet ledger, audit trail).
- `Chart` (wrapper único sobre la librería — ver decisión abajo).

### Perks-specific
- `PointsCounter` (rolling number).
- `TierRing` (avatar con anillo del color del tier).
- `WalletCard` (balances resumidos con secondary breakdown).
- `RewardCard` (con imagen, cost, CTA).
- `ChallengeCard` (progreso, deadline, recompensa).
- `BadgeGrid` (grilla con estados: unlocked / locked / secret).
- `RuleEditor` (form + preview + dry-run).
- `SegmentBuilder` (constructor de predicados).

### Layout
- `AppShell` (topbar + sidebar + main).
- `PageHeader` (con breadcrumbs + acciones).
- `Section`, `SectionHeader`.

---

## Patrones de UX

**Densidad**: Alta pero con jerarquía. Tres tipos de página:
- **Overview** (dashboards) — tiles + charts, densidad media, motion sutil.
- **Working table** (customers, reglas, redemptions) — DataTable con filtros aparentes.
- **Detail / Composer** (editar regla, crear reward) — layout de dos columnas: forma a la izquierda, preview vivo a la derecha.

**Command palette**: `Cmd/Ctrl + K` abre búsqueda global (customer, reglas, campañas). Es el atajo #1 de productividad.

**Shortcuts** obligatorios en flujos frecuentes:
- `N` — nuevo (contextual).
- `E` — editar seleccionado.
- `/` — foco en búsqueda.
- `G` seguido de letra — navegar a sección (`G C` → Customers).

**Estados vacíos**: nunca una pantalla en blanco. Siempre ilustración + copy que explica + CTA sugerido.

**Feedback de acción**: cada mutación exitosa produce un toast; cada error, un toast rojo con "reintentar" y "reportar".

**Optimistic UI**: donde la latencia importa (mark-paid, canje), aplicamos el cambio en frontend y revertimos si falla.

---

## Superficies del customer (público)

Público = quien ve el widget o la PWA de wallet. Reglas propias:

- **Móvil first**. Diseño desde 360px de ancho hacia arriba.
- **Menos densidad, más celebración**. El humano no está trabajando — está recibiendo un beneficio.
- **Tipografía más grande** (base 15/16 px en vez de 13).
- **Animaciones más generosas** (respetando `prefers-reduced-motion`).
- **Sin login pesado**. Todo por magic link o sesión previa; nunca formulario de password.

Un tenant puede aplicar **branding ligero** (color primary, logo, nombre) sobre este layout — no hay whitelabel total en superficies del customer para preservar el reconocimiento cross-tenant.

---

## Charts

Librería única: **una** decisión, no varias.

Candidatos:
- **Recharts** (React only — descartado, usamos Angular).
- **Apache ECharts** — potente, pesa.
- **Chart.js** — simple, un poco anticuado.
- **Nivo** — bonito, React only.
- **d3 custom** — máximo control, tiempo.

**Recomendación**: **ECharts con wrapper Angular**. Cubre todo, tema fácilmente configurable con tokens, exportable a PNG.

**Reglas de charts**:
- Nunca 3D. Nunca donut sobrecargados. Nunca colores random.
- Máx 5 series simultáneas; más → agregar categoría "Otros".
- Palette secuencial y divergente definidos en tokens.
- Axis labels con unidades siempre.
- Tooltip con formato tabular.

---

## Iconografía

Set único: **Lucide Icons** (o continúa Material Icons Outlined si ya está en uso — decisión en Fase 1). No mezclar sets.

Tamaños canónicos: 16 (inline), 20 (botones), 24 (headers), 32 (empty states).

---

## Accesibilidad

- Contraste AA mínimo en todo texto (light y dark).
- Foco visible en todos los interactivos.
- Elementos interactivos custom (dropdowns, tabs) implementados con ARIA correcto.
- Todo lo navegable con teclado.
- Alt text en imágenes con contenido.
- Formularios con labels asociados, mensajes de error explícitos y accionables.

---

## Voz y tono

- **Directa**. Sin adjetivos vacíos, sin marketing hueco. El admin es profesional; le hablamos como colega.
- **Optimista pero no infantil**. Duolingo con moderación. Ni Slack "yay" ni Salesforce "please contact your administrator".
- **Español natural LATAM**. No traducciones literales del inglés. "Marcar como pagada" > "Establecer estado a pagado".
- **Números con contexto**. "3 ventas hoy · +12% vs ayer" mejor que "3 ventas".
- **Errores útiles**. Nunca "Error: 500". Siempre "No pudimos guardar el cambio. Intenta de nuevo. Si persiste, reporta con este ID: ABC123".

---

## 🚦 A validar contigo

### UI1 · Set de iconos

Recomendación: migrar a **Lucide** (más consistente, moderno, mejor cobertura). Costo: reemplazar 200-500 usos actuales de Material Icons. **Alternativa**: quedarse con Material Icons Outlined (ya en uso). Decisión afecta al MVP.

### UI2 · Librería de charts

Recomendación: **ECharts** con wrapper Angular propio. Otra opción: crear el wrapper una vez pero permitir intercambio de motor. ¿Vale el trabajo extra? En MVP no.

### UI3 · Motion — ¿nueva librería o CSS puro?

Angular Animations funciona pero es verbose. Alternativas:
- **CSS puro + web animations API** — cero peso, control total.
- **Motion One** (autor detrás de Framer Motion) — sintaxis limpia, ligero.
- **AutoAnimate** (por FormKit) — sirve para lo básico automáticamente.

Recomendación: **AutoAnimate + CSS puro** para 90% de casos + Motion One para las 2-3 celebraciones grandes.

### UI4 · Marca visual definitiva

Tenemos que definir con diseño los colores brand, la tipografía display si va, y el spritesheet ilustrado (empty states, celebraciones). Recomiendo agendar dos sesiones con diseñador antes de Fase 1.
