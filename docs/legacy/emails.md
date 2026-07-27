# Configuración de emails (Resend)

El sistema usa [Resend](https://resend.com) para enviar emails. Resend tiene plan
gratuito (3.000 emails/mes, 100/día) suficiente para empezar.

Si Resend NO está configurado, todo el sistema funciona igual; simplemente no se
envían correos. Cero impacto.

## Setup paso a paso

### 1. Crear cuenta en Resend

1. Ve a [resend.com/signup](https://resend.com/signup) y regístrate con tu email.
2. Verifica tu correo.

### 2. Generar API key

1. Dashboard → **API Keys** → **Create API Key**.
2. Nombre: `sistema-rifas-prod` (o lo que prefieras).
3. Permission: **Sending access**.
4. Copia la key (formato `re_XXXXXXXXX`). **No la verás otra vez.**

### 3. Configurar dominio (recomendado para producción)

Por defecto Resend solo te deja enviar desde `onboarding@resend.dev` y SOLO a la
dirección con la que te registraste. Para enviar a tus clientes reales necesitas
verificar un dominio:

1. Dashboard → **Domains** → **Add Domain**.
2. Escribe tu dominio (ej. `rifas-loterias.com`).
3. Resend te muestra 3-4 registros DNS (MX, TXT, DKIM).
4. Agrégalos en tu proveedor de dominio (Cloudflare, GoDaddy, Namecheap, etc.).
5. Espera 5-30 minutos y dale **Verify**.

Una vez verificado, puedes usar cualquier email de ese dominio como remitente
(ej. `noreply@rifas-loterias.com`).

### 4. Configurar variables en `.env`

```bash
RESEND_ENABLED=true
RESEND_API_KEY=re_XXXXXXXXXXXXXX
RESEND_FROM_EMAIL=noreply@tu-dominio.com   # o onboarding@resend.dev para test
RESEND_FROM_NAME=Loterías y Rifas 2026
ADMIN_NOTIFY_EMAIL=loteriasyrifas2026@gmail.com
```

### 5. Reiniciar backend

```bash
# en backend/
docker compose restart backend
# o si corres en local:
uvicorn app.main:app --reload
```

Listo. Los emails se enviarán a partir del próximo evento.

---

## Qué emails se envían

| Evento | A quién | Asunto | Contenido |
|--------|---------|--------|-----------|
| Vendedor reporta pago | Admin (`ADMIN_NOTIFY_EMAIL`) | `💳 Nuevo pago pendiente · Boleta XXX` | Datos del pago + link a `/admin/payments` |
| Admin confirma pago | Cliente (su email guardado) | `🎟 Boleta XXX confirmada · [Rifa]` | Plantilla premium con: badge "PAGO CONFIRMADO", número de boleta, 20 números, premios, datos del responsable, link verify, e **imagen PNG adjunta** de la boleta. |

## Cosas a saber

- **Si el cliente no tiene email** registrado, simplemente no se envía. Cero error.
- **Si Resend falla** (red, rate limit, etc.), la operación principal (confirmar pago, registrar comisión, etc.) NO se rompe. El error se loguea como warning.
- **El email del cliente** se valida con `EmailStr` de Pydantic al crear el cliente. Si está mal formateado, no se guarda.
- **Mientras desarrollas**, deja `RESEND_ENABLED=false` para no consumir el cuota gratuita.

## Costos

- Free tier: **3.000 emails/mes, 100/día** — suficiente para una rifa de 500 boletas
  con confirmaciones a cada cliente.
- Si crecen las rifas: el plan Pro de Resend es USD 20/mes por 50.000 emails.

## Troubleshooting

**Los emails no llegan al cliente**:
- Verifica que `RESEND_ENABLED=true` y `RESEND_API_KEY` esté presente.
- Si usas `onboarding@resend.dev`, recuerda que SOLO puedes enviar al email con
  el que te registraste en Resend (limitación de su sandbox).
- Revisa los logs del backend — debería aparecer `Email enviado a [...]` o
  `Resend respondió XXX: ...`.
- Mira el dashboard de Resend → **Emails** para ver el log de envíos.

**El correo cae en spam**:
- Confirma que tu dominio esté verificado en Resend (DKIM + SPF).
- Evita palabras spammy en el subject ("GRATIS", "GANE YA", etc.).

**Quiero enviar otros tipos de email**:
- Agrega más funciones en `backend/app/services/email_service.py` siguiendo el
  patrón de `send_ticket_paid_email`.
