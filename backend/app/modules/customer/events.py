"""Catálogo de eventos que publica el módulo customer.

Ver docs/04-EVENTS.md sección "customer". Todos los tipos aquí siguen
la convención `customer.<entity>.<action>` en pasado.

Estos son constantes con nombres canónicos — el service las usa al
armar `Event(type=..., ...)`. Mantener aquí centralizado facilita:
  1. Documentar de un vistazo qué produce el módulo.
  2. Refactor seguro: buscar usos con LSP.
  3. Reusar en tests para asertar publicación.
"""
from __future__ import annotations


# Emitido al reconocer/identificar un customer — sea existente o nuevo.
# `data.first_time` distingue si es primer contacto (customer nuevo) o
# reencuentro con un customer conocido.
CUSTOMER_IDENTIFIED = "customer.identified"

# Se conectó una identity nueva a un customer existente
# (ej. teléfono verificado tras haberse conocido por email).
CUSTOMER_IDENTITY_ADDED = "customer.identity.added"

# OTP correcto sobre email/phone → subimos score de confianza.
CUSTOMER_IDENTITY_VERIFIED = "customer.identity.verified"

# Cambios en atributos base o custom del profile.
CUSTOMER_PROFILE_UPDATED = "customer.profile.updated"

# Preference cambia (opt-in/out por canal).
CUSTOMER_CONSENT_GRANTED = "customer.consent.granted"
CUSTOMER_CONSENT_REVOKED = "customer.consent.revoked"

# Merge de duplicados — el customer perdedor se anula, ganador absorbe.
CUSTOMER_MERGED = "customer.merged"


ALL: tuple[str, ...] = (
    CUSTOMER_IDENTIFIED,
    CUSTOMER_IDENTITY_ADDED,
    CUSTOMER_IDENTITY_VERIFIED,
    CUSTOMER_PROFILE_UPDATED,
    CUSTOMER_CONSENT_GRANTED,
    CUSTOMER_CONSENT_REVOKED,
    CUSTOMER_MERGED,
)
