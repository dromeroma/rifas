# Configurar Supabase Storage para comprobantes de pago

En producción, los comprobantes de pago se almacenan en **Supabase Storage**
en lugar del disco local (que Render Free borra en cada deploy).

El backend funciona en dos modos transparentes:

| Modo | Cuándo se activa | Dónde guarda |
|---|---|---|
| **Supabase** | Si `SUPABASE_SERVICE_KEY` está seteado | Bucket privado en Supabase |
| **Local** | Si no | `UPLOAD_DIR/payments/` (default `./uploads/payments/`) |

Para producción, activa Supabase. Para dev local, basta con el modo local.

---

## 1. Crear el bucket en Supabase

1. Entra al dashboard de Supabase → tu proyecto.
2. Sidebar → **Storage** → **New bucket**.
3. Configuración:
   - **Name:** `payment-proofs`
   - **Public bucket:** ❌ NO (privado, por seguridad)
   - **File size limit:** 10 MB
   - **Allowed MIME types:** `image/jpeg, image/png, image/webp, application/pdf`
4. Click **Create bucket**.

## 2. Obtener el Service Role Key

> ⚠️ El **service role key** es secreto. Nunca lo expongas en el frontend.

1. Dashboard → **Project Settings** → **API**.
2. Sección "Project API keys" → copia `service_role` (empieza con `eyJ...`).
3. En Render: dashboard del backend → **Environment** → agrega:

```
SUPABASE_URL=https://amzdwbzwspqzirratgcx.supabase.co
SUPABASE_SERVICE_KEY=<el-service-role-key>
SUPABASE_STORAGE_BUCKET=payment-proofs
```

4. Redeploy del backend.

## 3. Verificar

Sube un comprobante desde un vendedor en producción. En Supabase Dashboard
→ Storage → `payment-proofs` deberías ver el archivo recién subido con
nombre tipo `a3b9c2...d4f1.jpg`.

En la BD, `payments.proof_url` ahora se verá como:

```
supabase://payment-proofs/a3b9c2...d4f1.jpg
```

Cuando el admin abre el comprobante desde el panel:
- El backend pide a Supabase una URL firmada (1 hora de validez).
- Devuelve un 307 Redirect a esa URL.
- El navegador del admin descarga directo desde Supabase CDN.

## 4. Migrar comprobantes antiguos (opcional)

Si tienes pagos legacy con archivos locales (rutas tipo `payments/abc.jpg`),
puedes:

**Opción A (recomendada):** dejarlos como están. El código sirve archivos
locales y de Supabase indistintamente según el formato de `proof_url`.

**Opción B (limpiar):** ejecutar un script que lea archivos locales, los
suba a Supabase, y actualice `payments.proof_url`. No hay script pre-hecho;
si lo necesitas, pídelo.

## Seguridad

- El bucket es **privado** → solo el backend (con service key) puede
  generar URLs firmadas.
- Cada URL firmada vence en **1 hora** — suficiente para que el admin
  abra y descargue, no permite compartir indefinidamente.
- El backend valida permisos (rol + tenant) antes de firmar la URL.

## Costos

Plan free de Supabase: 1 GB de Storage + 2 GB de bandwidth/mes. Para una
rifa promedio (500 boletas × ~200 KB de comprobante = ~100 MB) sobra.
Si planeas escalar a 100+ cuentas, considera el plan Pro ($25/mes).
