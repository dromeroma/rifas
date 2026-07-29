"""Catálogo de eventos del módulo audit."""
from __future__ import annotations


# Se emite tras cada persistencia exitosa en audit_logs. Útil para
# integraciones futuras (siem, alertas por severity alto).
AUDIT_ENTRY_RECORDED = "audit.entry.recorded"


ALL: tuple[str, ...] = (AUDIT_ENTRY_RECORDED,)
