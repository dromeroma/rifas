# Seguridad

## Autenticación

- JWT firmado con HS256.
- `access_token` 15 min, `refresh_token` 7 días.
- Rotación de refresh recomendada (la implementación inicial es estática; sustituir por blacklist en Redis al endurecer).
- Contraseñas con `bcrypt` cost 12 (`passlib`).

## Autorización

- Enum `UserRole`: `super_admin | admin | seller`.
- Decorador de dependencias `require_roles(...)` en cada endpoint sensible.
- El cliente final no tiene cuenta — accede sólo a `/verify/{code}`.

## Antifraude

| Riesgo                             | Mitigación |
|------------------------------------|------------|
| Número duplicado en una rifa       | `UNIQUE(raffle_id, number)` en SQL |
| Doble reserva concurrente          | `SELECT ... FOR UPDATE` + `version` |
| Edición de números post-generación | `numbers_generated=true` + lógica de servicio + auditoría |
| Doble confirmación de pago         | Validación de estado + UNIQUE compuesto opcional |
| Pago reportado pero no recibido    | Vendedor NO recibe efectivo — comprobante a cuenta del negocio |
| Suplantación de comprobante        | `proof_url` con nombre hasheado fuera de la raíz pública |
| Modificación de auditoría          | Tabla `append-only` por convención (no se exponen UPDATE/DELETE) |

## Validación

- Pydantic estricto en todos los DTOs.
- `RaffleCreate` valida `(number_max - number_min + 1) == total_tickets * numbers_per_ticket`.
- Validación de archivos subidos: tamaño, MIME, magic bytes.

## Transporte

- HTTPS obligatorio en producción (terminación en nginx o load balancer).
- HSTS, CSP, X-Frame-Options en nginx.
- CORS restringido a `FRONTEND_URL`.

## Rate limiting

- `slowapi` o nginx por IP en `/auth/login`, `/tickets/*/reserve`, `/payments`.

## Logs y auditoría

- Toda acción sensible llama a `audit_service.log_action(...)`.
- Logs aplicativos en JSON estructurado para ingesta a un SIEM.

## Hardening recomendado

- Backups diarios encriptados de PostgreSQL.
- Rotación de `JWT_SECRET_KEY` cada N meses con período de gracia.
- 2FA para `super_admin` (TOTP) — pendiente fase 2.
- Bloqueo de cuenta tras 5 fallos de login (Redis counter).
- Endurecer headers nginx.

## Cumplimiento

- Datos personales mínimos en `customers`.
- Política de retención: 24 meses tras la rifa.
- Borrado de comprobantes según política legal local.
