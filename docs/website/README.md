# docs/website

Recursos de marca y marketing de **Boletera**.

## Estado actual

La landing pública vive **dentro de la misma app Angular** en la ruta `/`
(ver [landing.component.ts](../../frontend/src/app/features/landing/landing.component.ts)).
Esto evita duplicar infra mientras el producto está en beta.

## Archivos

- [`BRANDING.md`](./BRANDING.md) — Guía completa de marca: posicionamiento,
  voz, slogans, paleta, tipografía, mensajes por canal, don'ts.
- [`PROMPT.md`](./PROMPT.md) — Prompt listo para entregar a un dev/IA cuando se
  decida sacar el sitio marketero a un proyecto independiente (Next.js).

## Cuándo migrar a sitio separado

Saltar a proyecto separado cuando:

- El blog SEO sea prioridad (necesitas MDX + Next.js para indexar bien).
- Necesites iterar landings A/B por campaña sin redeployar la app.
- Llegue dominio definitivo (`boletera.app` / `boletera.co`) y queramos
  subdominio `app.boletera.app` para el producto.
