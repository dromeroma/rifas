"""platform — infraestructura transversal de Savvy Perks.

Contiene:
  - ids: generación de identificadores ULID con prefijo por tipo de recurso.
  - events: event bus interno (envelope, outbox, dispatcher, registry).

platform NO tiene lógica de negocio. Es librería compartida por todos
los módulos de dominio.
"""
