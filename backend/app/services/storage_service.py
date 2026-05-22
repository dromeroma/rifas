"""
Almacenamiento de comprobantes de pago.

Si está configurado `SUPABASE_SERVICE_KEY`, los archivos se suben a
Supabase Storage (bucket `SUPABASE_STORAGE_BUCKET`, default
`payment-proofs`). De lo contrario, fallback a disco local en
`UPLOAD_DIR/payments/`.

Las rutas almacenadas en `payments.proof_url` adoptan el siguiente formato:

  - Local:    `payments/<random>.jpg`            (legacy)
  - Supabase: `supabase://<bucket>/<random>.jpg`  (nuevo)

`is_supabase_proof_url(...)` y `serve_proof(...)` se encargan de cada caso
de forma transparente al endpoint.
"""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path
from typing import BinaryIO

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_SUPABASE_PREFIX = "supabase://"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}


def storage_enabled() -> bool:
    return bool(settings.supabase_service_key and settings.supabase_url)


def is_supabase_proof_url(proof_url: str) -> bool:
    return proof_url.startswith(_SUPABASE_PREFIX)


def upload_proof(file: BinaryIO, original_filename: str) -> str:
    """Sube el archivo al backend de storage configurado y devuelve la
    referencia a guardar en `payments.proof_url`.

    Lanza ValueError si la extensión no está permitida.
    """
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"extensión no permitida: {ext}")

    if storage_enabled():
        return _upload_supabase(file, ext)
    return _upload_local(file, ext)


# ============ Local (fallback / dev) ============

def _upload_local(file: BinaryIO, ext: str) -> str:
    upload_dir = Path(settings.upload_dir) / "payments"
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{secrets.token_hex(12)}{ext}"
    target = upload_dir / filename
    with open(target, "wb") as out:
        while True:
            chunk = file.read(64 * 1024)
            if not chunk:
                break
            out.write(chunk)
    return f"payments/{filename}"


# ============ Supabase Storage ============

def _supabase_headers() -> dict[str, str]:
    return {
        "apikey": settings.supabase_service_key,
        "Authorization": f"Bearer {settings.supabase_service_key}",
    }


def _upload_supabase(file: BinaryIO, ext: str) -> str:
    bucket = settings.supabase_storage_bucket
    filename = f"{secrets.token_hex(12)}{ext}"
    url = f"{settings.supabase_url}/storage/v1/object/{bucket}/{filename}"

    # Leemos el archivo completo (los comprobantes son < 10MB)
    file.seek(0)
    body = file.read()

    headers = {
        **_supabase_headers(),
        "Content-Type": _CONTENT_TYPES.get(ext, "application/octet-stream"),
        "x-upsert": "false",
    }
    resp = httpx.post(url, content=body, headers=headers, timeout=30.0)
    if resp.status_code >= 300:
        logger.error(
            "Supabase Storage upload failed: %s %s", resp.status_code, resp.text[:300],
        )
        raise RuntimeError(f"upload falló: HTTP {resp.status_code}")

    return f"{_SUPABASE_PREFIX}{bucket}/{filename}"


def signed_url_for_proof(proof_url: str, expires_in: int = 3600) -> str | None:
    """Para archivos en Supabase Storage, devuelve una URL firmada temporal.
    Para archivos locales devuelve None (el caller debe servir desde disco)."""
    if not is_supabase_proof_url(proof_url):
        return None

    # supabase://bucket/path → bucket="bucket", path="path"
    rest = proof_url[len(_SUPABASE_PREFIX):]
    bucket, _, path = rest.partition("/")
    if not bucket or not path:
        return None

    url = f"{settings.supabase_url}/storage/v1/object/sign/{bucket}/{path}"
    resp = httpx.post(
        url, json={"expiresIn": expires_in},
        headers=_supabase_headers(), timeout=10.0,
    )
    if resp.status_code >= 300:
        logger.error("signed URL falló: %s %s", resp.status_code, resp.text[:300])
        return None
    data = resp.json()
    signed = data.get("signedURL") or data.get("signedUrl")
    if not signed:
        return None
    # signedURL viene como "/object/sign/<bucket>/<path>?token=..." (sin host)
    if signed.startswith("/"):
        return f"{settings.supabase_url}/storage/v1{signed}"
    return signed


def local_proof_path(proof_url: str) -> Path | None:
    """Devuelve la ruta absoluta del archivo local, o None si es Supabase."""
    if is_supabase_proof_url(proof_url):
        return None
    return Path(settings.upload_dir) / proof_url
