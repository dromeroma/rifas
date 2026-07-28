"""Registro central de handlers del event bus.

Cada módulo que consume eventos de otros expone sus handlers en su
propio `handlers.py`. Este archivo los importa a todos — el side
effect de import ejecuta los `@registry.on(...)` que dejan las
suscripciones vivas en el registry global.

Se importa una sola vez desde `app/main.py` durante el lifespan.

Regla: solo import de paquetes de handlers, sin lógica. Un módulo por
línea, alfabetizado.
"""
# wallet
from app.modules.wallet import handlers as _wallet_handlers  # noqa: F401
