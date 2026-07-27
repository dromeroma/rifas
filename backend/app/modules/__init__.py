"""Módulos de dominio de Savvy Perks.

Cada módulo respeta las reglas de dependencia declaradas en
docs/03-ARCHITECTURE.md y verificadas por import-linter en CI.

Reglas resumen:
  - platform puede ser importado por todos.
  - identity, customer no importan de otros módulos de negocio.
  - wallet, rewards, gamification pueden importar customer (por id),
    NO entre sí — se hablan por eventos.
  - rules, campaigns importan solo interfaces declaradas.
  - adapters/* son fronteras externas.

Hasta el cutover de rifas (2026-08-05), este árbol coexiste con la
estructura legacy (app/models, app/routers, app/services). Ningún
módulo aquí toca los flujos activos de rifas — solo se construye
infraestructura nueva en aislamiento.
"""
