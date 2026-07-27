# ADR-006 · Migración de Boletera al módulo `raffles/` con freeze hasta 4-ago-2026

- **Estado**: Proposed
- **Fecha**: 2026-07-26
- **Relacionado con**: [`02-DOMAIN.md`](../02-DOMAIN.md), [`09-ROADMAP.md`](../09-ROADMAP.md)

## Contexto

Boletera es la aplicación actual — el producto vive en producción con clientes reales. El más crítico: **Rifas El Golazo**, con sorteo del televisor + 3 bonos de 200K entre el **1 y el 4 de agosto de 2026**.

Al mismo tiempo estamos armando el rediseño Savvy Perks, donde las rifas pasan a ser **un módulo** (`apps/api/modules/raffles/`) en vez del centro del producto.

Existen dos riesgos opuestos:
- **Congelar todo** el desarrollo hasta después del sorteo → perdemos ~10 días productivos.
- **Migrar en caliente** → riesgo de romper flujos de venta durante la ventana más crítica del cliente actual.

## Decisión

**Freeze de features** en el código actual de rifas hasta pasar el 4-ago-2026. La refactorización a módulo `raffles/` ocurre en paralelo, **sin exponer cambios al cliente** hasta el cutover.

### Reglas del freeze

1. En la rama de producción (código actual) solo se hacen:
   - Bug fixes de severidad alta que afecten la operación del sorteo.
   - Ajustes de datos vía scripts controlados.
   - Ninguna feature nueva, ningún refactor grande, ningún cambio de UI.

2. En la rama `feat/savvy-perks-transformation` (esta rama):
   - Docs, ADRs, y toda la Fase 0.
   - A partir de Fase 1, el módulo `raffles/` puede refactorizarse sin merge a main.
   - Las migraciones que afecten a la BD de rifas se posponen a después del cutover, salvo que sean estrictamente aditivas y reversibles.

3. Comunicación con el cliente (Rifas El Golazo):
   - No hay cambios visibles.
   - Soporte reactivo a lo que necesite el operador durante los sorteos.

### Cutover

- **Fecha propuesta**: 5-ago-2026.
- **Precondición**: sorteos ejecutados exitosamente, sin issues abiertos críticos.
- **Post-cutover**: rifas pasa a ser módulo `raffles/`. Los flujos operativos y las URLs públicas se mantienen para los QRs impresos.

## Consecuencias

### Positivas

- Cero riesgo para el sorteo real que ya está agendado.
- Permite avanzar el rediseño en paralelo (docs, arquitectura, cimientos).
- Cliente actual no vive experimento.

### Negativas

- ~10 días sin poder hacer cambios de UI/UX solicitados por el operador. Mitigable con soporte manual y ajustes de datos.
- La rama de refactor puede acumular divergencia con main durante el freeze — se rebase-a antes del cutover.

## Alternativas consideradas

**A. Migrar en caliente durante los sorteos.**
Rechazado. Riesgo inaceptable con dinero real y cliente estresado en la ventana del sorteo.

**B. Freeze de todo el desarrollo (incluyendo rediseño).**
Rechazado. Bloquea Fase 0 y 1 innecesariamente. La refactor a módulo puede prepararse en paralelo sin tocar producción.

**C. Cutover antes del sorteo.**
Rechazado. Si algo sale mal durante la migración, el sorteo se afecta.

**D. Freeze de producción + refactor en paralelo (elegido).**
Balance correcto: cero riesgo para el cliente, cero pérdida de tiempo del equipo.

## Aprobación

- [ ] Founder (confirmar que el sorteo del 4-ago es la última fecha crítica en la ventana)
