# Deploy: Render (backend) + Vercel (frontend)

Arquitectura recomendada para la primera versión:

```
┌────────────────────┐   HTTPS    ┌────────────────────┐
│  Vercel            │ ─────────► │  Render            │
│  Angular SPA       │            │  FastAPI + uvicorn │
│  https://*.vercel  │            │  https://*.onrender│
└────────────────────┘            └────────┬───────────┘
                                            │ Postgres
                                            ▼
                                  ┌────────────────────┐
                                  │  Supabase (DB)     │
                                  └────────────────────┘
```

Orden recomendado: **primero backend (Render)** porque la URL del backend la
necesita Vercel. Después frontend (Vercel) con la URL del backend en sus envs.
Al final, vuelves a Render a configurar `FRONTEND_URL` y `CORS_ORIGINS` con la
URL de Vercel.

---

## 1. Backend en Render

### 1.1 Crear servicio

1. Entra a [render.com](https://render.com), sign-in con tu cuenta de GitHub.
2. **New +** → **Web Service** → conecta el repo `dromeroma/rifas`.
3. Configura:
   - **Name**: `rifas-backend` (o el que prefieras)
   - **Region**: `Oregon` (más cercano a Supabase us-east-1) o el que prefieras
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`

> Alternativa: en lugar de configurar a mano, usa **Blueprints** → conecta el
> repo → Render detecta `backend/render.yaml` automáticamente.

### 1.2 Variables de entorno (Render → Environment)

Copia y pega estos valores. Los marcados ⚠ DEBEN cambiarse:

| Variable | Valor |
|----------|-------|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `PYTHON_VERSION` | `3.12.0` |
| `DATABASE_URL` | ⚠ pega tu pooler de Supabase (puerto **6543** transaction o **5432** session — recomendado 5432) |
| `ALEMBIC_DATABASE_URL` | ⚠ pega el direct connection de Supabase (`db.<REF>.supabase.co:5432`) |
| `JWT_SECRET_KEY` | ⚠ genera uno NUEVO de 64+ chars (`openssl rand -hex 32` o usa el botón "Generate" de Render) |
| `JWT_ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRES_MIN` | `15` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` |
| `BCRYPT_ROUNDS` | `12` |
| `FRONTEND_URL` | ⚠ se rellena después con la URL de Vercel (p. ej. `https://rifas.vercel.app`) |
| `CORS_ORIGINS` | ⚠ misma URL de Vercel |
| `UPLOAD_DIR` | `/tmp/uploads` (filesystem efímero del plan free) |
| `MAX_UPLOAD_MB` | `10` |
| `RESERVATION_HOURS` | `24` |
| `LOCK_DAYS_BEFORE_DRAW` | `7` |
| `RESEND_ENABLED` | `true` |
| `RESEND_API_KEY` | tu key `re_...` de Resend |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` (o tu dominio verificado) |
| `RESEND_FROM_NAME` | `Loterías y Rifas 2026` |
| `ADMIN_NOTIFY_EMAIL` | tu correo (recibe alertas de nuevos pagos) |

### 1.3 Deploy

- Pulsa **Create Web Service**. Render compila, instala dependencias y arranca.
- Tarda 3–6 minutos la primera vez.
- Al terminar verás URL tipo `https://rifas-backend-XXXX.onrender.com`.
- **Health check**: abre `https://rifas-backend-XXXX.onrender.com/health` →
  debe responder `{"status":"ok","env":"production"}`.
- **Swagger**: `https://rifas-backend-XXXX.onrender.com/docs`.

### 1.4 Aplicar migraciones (primera vez)

Si la BD de Supabase ya tiene el esquema (porque corriste alembic localmente), **no hace falta**. Si es nueva:

- Opción A: corre `alembic upgrade head` desde tu máquina contra Supabase (más fácil).
- Opción B: agrega al `startCommand` de Render: `alembic upgrade head && uvicorn ...`.

### ⚠ Sobre el plan free de Render

- **Se duerme después de 15 min sin tráfico**. La primera petición tras dormir tarda 30–60 s (cold start).
- **Filesystem efímero**: archivos en `/tmp/uploads` (comprobantes de pago) se pierden al reiniciar el contenedor.
  - Aceptable para el MVP. Si querés que los comprobantes persistan, subirlos a Supabase Storage (lo dejamos como mejora futura).
- 750 horas/mes gratis. Un servicio único cabe.

---

## 2. Frontend en Vercel

### 2.1 Importar el proyecto

1. Entra a [vercel.com](https://vercel.com), sign-in con GitHub.
2. **Add New** → **Project** → busca `dromeroma/rifas` → **Import**.
3. Configura:
   - **Framework Preset**: `Other` (Vercel detecta `vercel.json` y aplica)
   - **Root Directory**: `frontend`
   - **Build Command**: dejar el default (lee `vercel.json` → `npm run build`)
   - **Output Directory**: dejar el default (lee `dist/sistema-rifas/browser`)
   - **Install Command**: dejar el default

### 2.2 Variables de entorno

En **Environment Variables**, agrega:

| Variable | Valor |
|----------|-------|
| `API_URL` | `https://rifas-backend-XXXX.onrender.com` (la URL de Render del paso 1.3) |

Esta variable la usa nuestro script `frontend/scripts/inject-env.mjs` que corre
en `prebuild` y escribe la URL en `environment.prod.ts` antes de que Angular compile.

### 2.3 Deploy

- **Deploy**. Tarda 2–4 minutos.
- Te asigna URL tipo `https://rifas.vercel.app`.

### 2.4 ⚠ Vuelve a Render

Ahora que tienes la URL de Vercel, **actualiza estas variables en Render**:

- `FRONTEND_URL` = `https://rifas.vercel.app`
- `CORS_ORIGINS` = `https://rifas.vercel.app` (o varias separadas por coma si tienes dominio propio luego)

Render hará redeploy automático. Mientras tanto, el frontend no podrá hablar con
el backend por CORS.

---

## 3. Verificación end-to-end

1. Abre `https://rifas.vercel.app`.
2. Login con tu super admin.
3. Sidebar → Pagos → tabla cargada (vacía si es nuevo).
4. Crea una boleta de prueba, reporta pago, confirma. Verifica que:
   - Llegue email al admin.
   - Llegue email al cliente con la boleta adjunta.
   - La auditoría registre los eventos.

---

## 4. Dominio personalizado (opcional, cuando lo tengas)

**En Vercel**:
1. Project Settings → Domains → Add → `rifas.tu-dominio.com`.
2. Te muestran un CNAME a configurar.
3. Lo agregas en tu DNS y verificas.

**En Render**:
1. Si lo deseas, también puedes ponerle un dominio al backend (`api.tu-dominio.com`).
2. Settings → Custom Domains.
3. Cuando lo tengas, actualiza `API_URL` en Vercel.

**En Resend**: agrega el mismo dominio (sección Domains de Resend) y configura
los DNS para envío de emails. Cambia `RESEND_FROM_EMAIL=noreply@tu-dominio.com`.

---

## 5. Continuous Deployment

Una vez configurados, cada `git push` a `main`:
- Render rebuild + redeploy automático.
- Vercel rebuild + redeploy automático.

Si quieres revisar un PR antes: Vercel hace **preview deploys** automáticos en
cada rama / PR sin tocar producción.

---

## Troubleshooting

**"CORS error" en el navegador**
- Verifica que `CORS_ORIGINS` en Render coincida EXACTAMENTE con la URL de Vercel (sin `/` al final, con `https://`).
- Reinicia el servicio de Render.

**Backend devuelve 502/503 al inicio**
- Es el cold start del plan free. Espera 30–60 s y vuelve a intentar.

**Emails no llegan**
- Confirma `RESEND_ENABLED=true` y `RESEND_API_KEY` en Render.
- Mientras uses `onboarding@resend.dev`, Resend solo permite enviar al email con que registraste la cuenta.
- Ve a docs/emails.md para la guía completa.

**Comprobantes desaparecen**
- En Render free el filesystem es efímero. Migrar a Supabase Storage es la solución (siguiente sprint).

**Frontend muestra "API_URL: /api"**
- Olvidaste configurar `API_URL` en Vercel.
- Settings → Environment Variables → agrégalo → Redeploy.
