# Roadmap

## MVP — Fase 1 (lo que está en este repo)

- [x] Estructura backend FastAPI + SQLAlchemy async
- [x] Modelos: usuarios, rifas, premios, boletas, números, clientes, pagos, comisiones, reservas, asignaciones, auditoría, notificaciones
- [x] Algoritmo de generación inmutable de números (CSPRNG + UNIQUE)
- [x] JWT con roles
- [x] Endpoints: auth, rifas, premios, boletas, reservas, verificación pública
- [x] PDF con cancha de fútbol y QR
- [x] Worker de expiración de reservas
- [x] Frontend Angular 21 standalone + signals
- [x] Componente reutilizable `<app-ticket-design>` (cancha de fútbol)
- [x] Panel admin: listar rifas, detalle, generar números, vista previa boleta
- [x] Panel vendedor: reservar y previsualizar
- [x] Verificación pública por QR/código
- [x] docker-compose con db + redis + backend + worker + frontend

## Fase 2 — Operación completa

- [ ] Subida de comprobantes de pago + confirmación
- [ ] Cálculo y panel de comisiones
- [ ] Notificaciones (email + WhatsApp vía proveedor) — `worker` ya está listo para sumar tareas
- [ ] Reportes financieros: ventas por día/vendedor/método, utilidad estimada
- [ ] Exportación a Excel/PDF
- [ ] Búsqueda y filtros avanzados
- [ ] Registro y reset de contraseña
- [ ] Asignación masiva de boletas a vendedores (rango / "siguientes N")
- [ ] Cortes diarios/semanales con cierre y firma del admin

## Fase 3 — Producto SaaS

- [ ] Multi-tenant (organizaciones / clientes)
- [ ] Subdominio por organización + branding
- [ ] Pasarela de pago integrada (Wompi, ePayco, MercadoPago)
- [ ] Sorteo en vivo con transmisión
- [ ] App móvil dedicada (PWA + push)
- [ ] Marketplace público de rifas
- [ ] Dashboard con BI (Metabase / Superset)

## Calidad y operaciones

- [ ] Suite de tests pytest cubriendo: generador de números, reservas concurrentes, transiciones de estado
- [ ] Tests E2E con Playwright
- [ ] CI: GitHub Actions con lint, tests, build, scan de dependencias
- [ ] Observabilidad: logs estructurados JSON, Prometheus + Grafana
- [ ] Backups automatizados de PostgreSQL
- [ ] Política de retención de comprobantes y datos personales
