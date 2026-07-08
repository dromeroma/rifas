"""
Cliente Wompi para checkout link + verificación de webhook.

Wompi (Bancolombia) es la pasarela más usada en Colombia para aceptar
Nequi, PSE, Bancolombia Transfer, tarjeta débito/crédito y Daviplata.

Documentación oficial: https://docs.wompi.co/

Este módulo es INDEPENDIENTE del tenant: cada tenant tiene sus propias
llaves (guardadas en tenants.wompi_*). Al crear un checkout, el llamador
pasa el Tenant y aquí sacamos las llaves + entorno.

Flujo típico:
    1. Cliente elige boletas y presiona "Pagar"
    2. Backend crea WompiTransaction (status=PENDING, reference único)
    3. Backend llama create_checkout_url(tenant, tx, redirect_url)
       → recibe checkout_url de Wompi + hash de integridad
    4. Cliente redirect a checkout_url, paga en Wompi
    5. Wompi hace POST a /public/wompi/webhook
    6. verify_webhook_signature(tenant, event) confirma que es legítimo
    7. Backend actualiza WompiTransaction + marca tickets como PAID
    8. Wompi redirige al cliente a redirect_url con status
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

import httpx

from app.services.crypto_service import decrypt

log = logging.getLogger(__name__)

WOMPI_SANDBOX_URL = "https://sandbox.wompi.co/v1"
WOMPI_PROD_URL = "https://production.wompi.co/v1"


def _api_base(env: str) -> str:
    return WOMPI_PROD_URL if env == "production" else WOMPI_SANDBOX_URL


def _integrity_hash(reference: str, amount_cents: int, currency: str, integrity_key: str) -> str:
    """Hash de integridad requerido por Wompi Widget/Checkout.

    Documentación: https://docs.wompi.co/docs/colombia/widget-checkout-web/
    Fórmula: SHA-256 de: reference + amount + currency + integrity_key
    """
    raw = f"{reference}{amount_cents}{currency}{integrity_key}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_checkout_url(
    *,
    public_key: str,
    reference: str,
    amount_cents: int,
    currency: str,
    integrity_key: str,
    redirect_url: str,
    customer_email: str | None = None,
) -> str:
    """Construye la URL del Widget de Checkout de Wompi.

    Este endpoint (checkout.wompi.co) NO requiere llamada API — se
    construye del lado del servidor con query params firmados. El cliente
    hace GET al URL y ve la UI de pago de Wompi.

    Alternativa: usar Wompi API para crear una "payment link" persistente,
    pero para el flujo de una compra única el widget con hash de integridad
    es más simple y más rápido.
    """
    from urllib.parse import urlencode

    signature = _integrity_hash(reference, amount_cents, currency, integrity_key)

    params = {
        "public-key": public_key,
        "currency": currency,
        "amount-in-cents": amount_cents,
        "reference": reference,
        "signature:integrity": signature,
        "redirect-url": redirect_url,
    }
    if customer_email:
        params["customer-data:email"] = customer_email

    return f"https://checkout.wompi.co/p/?{urlencode(params)}"


async def fetch_transaction(env: str, wompi_transaction_id: str, private_key: str) -> dict[str, Any]:
    """Consulta el estado real de una transacción vía API Wompi.

    Se usa como fallback/verificación cuando llega el webhook: en lugar
    de confiar 100% del payload, consultamos directo a Wompi con nuestra
    private key para confirmar.
    """
    url = f"{_api_base(env)}/transactions/{wompi_transaction_id}"
    headers = {"Authorization": f"Bearer {private_key}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url, headers=headers)
        r.raise_for_status()
        return r.json()


def verify_event_signature(event_body_raw: bytes, checksum: str, webhook_secret: str) -> bool:
    """Verifica la firma del webhook de Wompi.

    Wompi manda en el payload un campo `signature.checksum` que es
    SHA-256 sobre la concatenación de los `signature.properties` (valores
    del payload) + timestamp + webhook_secret.

    Doc: https://docs.wompi.co/docs/colombia/eventos/

    Este helper hace la verificación con un HMAC-SHA256 conservador
    (usamos hmac.compare_digest para evitar timing attacks).
    """
    if not checksum or not webhook_secret:
        return False
    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        event_body_raw,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, checksum)


def tenant_wompi_config(tenant) -> dict[str, Any] | None:
    """Devuelve un dict con las llaves Wompi ya descifradas del tenant.
    Retorna None si el tenant no tiene Wompi configurado."""
    if not tenant.wompi_public_key or not tenant.wompi_private_key_enc:
        return None
    try:
        private_key = decrypt(tenant.wompi_private_key_enc)
    except Exception:
        log.exception("no se pudo descifrar wompi_private_key para tenant_id=%s", tenant.id)
        return None
    return {
        "env": tenant.wompi_env or "sandbox",
        "public_key": tenant.wompi_public_key,
        "private_key": private_key,
        "webhook_secret": tenant.wompi_webhook_secret,
        "integrity_key": tenant.wompi_integrity_key,
    }
