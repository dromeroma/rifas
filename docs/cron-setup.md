# Configurar cron jobs en Render

Boletera tiene dos endpoints pensados para ejecutarse periódicamente desde
un cron externo (no tienen worker interno):

| Endpoint | Frecuencia recomendada | Qué hace |
|---|---|---|
| `POST /admin/tenants/check-expirations` | Diario (ej. 9:00 AM) | Envía emails de pre-vencimiento de suscripción a las cuentas a 7, 3 y 1 día(s) de vencer. Idempotente. |
| `POST /admin/expire-reservations` | Cada 1 hora | Libera reservas de boletas con `expires_at` ya pasado. |

## 1. Generar un `CRON_SECRET`

Crea un string aleatorio largo (≥ 32 chars). Por ejemplo:

```bash
openssl rand -hex 32
# => 4a3f1c... (úsalo como valor)
```

Configúralo en Render como variable de entorno del servicio backend:

```
CRON_SECRET=<el-string-generado>
```

Redeploy del backend para que tome efecto. El endpoint
`/admin/tenants/check-expirations` aceptará requests con el header
`X-Cron-Secret: <el-string-generado>` sin necesidad de JWT.

## 2. Crear el Cron Job en Render

En el dashboard de Render → **New + → Cron Job**.

### Job 1: notificaciones de pre-vencimiento

| Campo | Valor |
|---|---|
| Name | `boletera-expiry-notifications` |
| Schedule (UTC) | `0 14 * * *` (9:00 AM hora Colombia / UTC-5) |
| Command | Ver abajo |
| Environment | (vacío, o copia el del backend) |

Command:

```bash
curl -X POST "https://rifas-nehd.onrender.com/admin/tenants/check-expirations" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  --fail --silent --show-error
```

Marca la variable `CRON_SECRET` como secret en la sección Environment del
Cron Job.

### Job 2: liberar reservas vencidas

**Pendiente:** este endpoint todavía requiere JWT. Para automatizarlo
desde cron sin guardar credenciales, crea un usuario `cron@boletera.app`
con rol `admin` en una cuenta de servicio (o agrega soporte a cron_secret
en `/admin/expire-reservations`, similar a `/admin/tenants/check-expirations`).

Por ahora, ejecútalo manualmente desde el detalle de cualquier rifa
(botón "Liberar vencidas") cuando lo necesites.

## 3. Verificar

Una vez configurado, puedes probarlo manualmente:

```bash
curl -X POST "https://rifas-nehd.onrender.com/admin/tenants/check-expirations" \
  -H "X-Cron-Secret: <tu-secret>" \
  -H "Content-Type: application/json"
```

Respuesta esperada:

```json
{
  "checked": 1,
  "notified": 0,
  "notifications": []
}
```

Cuando un tenant esté a ≤ 7 días de vencer, `notified` empieza a contar.

## Comportamiento idempotente

`last_pre_expiry_notification_days` en la tabla `tenants` evita duplicados.
La primera vez que el tenant cae en el threshold 7, se manda email y se
guarda `7`. La próxima ejecución solo enviará si cae al threshold 3 (es
decir, `last_pre_expiry_notification_days > target`). Resultado: máximo 3
emails por suscripción (en 7, 3, 1 día antes de vencer).

Cuando renueves la suscripción (extiendes `end_date`), también deberías
resetear `last_pre_expiry_notification_days` a `null` desde el panel para
que el ciclo de notificaciones empiece de nuevo. (Pendiente: hacerlo
automático cuando `end_date` cambia.)
