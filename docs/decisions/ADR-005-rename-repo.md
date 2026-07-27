# ADR-005 · Rename del repo GitHub `rifas` → `savvy-perks`

- **Estado**: Proposed
- **Fecha**: 2026-07-26

## Contexto

El repositorio actual se llama `dromeroma/rifas` porque nació como Boletera. El producto pasa a llamarse **Savvy Perks** y el módulo de rifas queda como uno más dentro del sistema.

Un nombre de repo que ya no refleja el dominio genera:
- Fricción cognitiva para nuevos devs y usuarios de la API.
- Riesgo de branding — clones/forks del repo muestran nombre desalineado.
- Mensajes de commits y URLs de PR que hablan de "rifas" cuando ya no lo son.

## Decisión

Renombrar el repositorio a `dromeroma/savvy-perks` cuando se cierre Fase 0.

- GitHub mantiene **redirects automáticos** de URLs del repo viejo (issues, PRs, clones vía HTTPS, releases). No hay ruptura para links existentes.
- Los remotes locales de los devs siguen funcionando; recomendamos actualizar con `git remote set-url origin ...` cuando se pueda.
- Webhooks configurados en el repo se preservan.
- Integraciones con Render, Cloudflare Pages/Workers y CI deben verificarse tras el rename — típicamente Render usa el URL de repo por owner+id interno, no por nombre, y suele no romperse; Cloudflare puede necesitar re-autorizar.

## Consecuencias

### Positivas

- Alineación de branding en todas las superficies (git, CI, dashboards, docs).
- Menos confusión para el equipo y para futuros contribuidores.
- Setup más limpio para las próximas fases (docs, README, package names).

### Negativas

- Bookmarks internos con la URL vieja siguen funcionando pero envían 301. Los devs deben actualizar `origin`.
- Bots o scripts que hagan clone por nombre exacto pueden requerir ajuste.
- Ventana pequeña de "durante el rename" donde el repo puede quedar unreachable ~1 minuto.

## Plan de ejecución

1. Anunciar al equipo (aquí mismo son 1-3 devs, mínima ceremonia).
2. Hacer el rename desde Settings → General → Repository name.
3. Actualizar `origin` en todos los checkouts locales: `git remote set-url origin git@github.com:dromeroma/savvy-perks.git`.
4. Verificar deploys:
   - Cloudflare Worker (proyecto `perks`).
   - Render service (`rifas-nehd`).
   - Cualquier webhook externo.
5. Actualizar `package.json` (`name`), `README.md`, badges, y referencias en docs.
6. Un commit `chore: rename to savvy-perks` con los cambios de texto.

## Alternativas consideradas

**A. No renombrar.**
Rechazado. El costo de dejar el nombre viejo es acumulativo — cada semana que pasa, más links, más docs, más muscle memory apuntando al nombre incorrecto.

**B. Renombrar solo el nombre "público" (README, package.json) sin renombrar el repo.**
Rechazado. El branding queda partido, lo que confunde más de lo que ayuda.

**C. Nuevo repo desde cero.**
Rechazado. Pierde historial de commits, issues, PRs.

## Aprobación

- [ ] Founder (autorizar ventana)
- [ ] Verificación post-rename de Render + Cloudflare
