"""perks_overview — vistas agregadas para el admin panel.

Módulo delgado que no tiene modelo propio. Sólo compone queries
sobre módulos existentes (customer, wallet, rules, platform.events)
para armar el resumen del dashboard.

Exporta el router; la lógica vive dentro del propio router (queries
puntuales — no amerita un service.py separado en Fase 1).
"""
