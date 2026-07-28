"""Catálogo de eventos que publica el módulo wallet.

Convención `wallet.<entity>.<action>` en pasado, ver docs/04-EVENTS.md.
"""
from __future__ import annotations


WALLET_CREATED = "wallet.created"

# Puntos como catch-all: en Fase 1 usamos el mismo type para todos los
# balance types (points, xp, cashback_cop) — el payload lleva el tipo.
# Cuando el volumen justifique granularidad por tipo, se subdivide.
WALLET_POINTS_CREDITED = "wallet.points.credited"
WALLET_POINTS_DEBITED = "wallet.points.debited"
WALLET_POINTS_EXPIRED = "wallet.points.expired"

WALLET_VOUCHER_ISSUED = "wallet.voucher.issued"
WALLET_VOUCHER_REDEEMED = "wallet.voucher.redeemed"
WALLET_VOUCHER_EXPIRED = "wallet.voucher.expired"
WALLET_VOUCHER_REVOKED = "wallet.voucher.revoked"

WALLET_BALANCE_ADJUSTED = "wallet.balance.adjusted"


ALL: tuple[str, ...] = (
    WALLET_CREATED,
    WALLET_POINTS_CREDITED,
    WALLET_POINTS_DEBITED,
    WALLET_POINTS_EXPIRED,
    WALLET_VOUCHER_ISSUED,
    WALLET_VOUCHER_REDEEMED,
    WALLET_VOUCHER_EXPIRED,
    WALLET_VOUCHER_REVOKED,
    WALLET_BALANCE_ADJUSTED,
)
