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

# rules — importa el módulo entero para que actions bundled y el
# handler universal se registren (rules.actions se dispara desde
# rules/__init__.py).
from app.modules import rules as _rules  # noqa: F401

# notifications — importar el módulo dispara el registro de la action
# `notifications.send` en action_registry del Rules Engine, además de
# registrar los providers bundled (in_app, email fake, webhook).
from app.modules import notifications as _notifications  # noqa: F401

# onboarding — al importarse registra handlers que auto-completan
# steps del checklist al escuchar los eventos relevantes del bus.
from app.modules import onboarding as _onboarding  # noqa: F401

# audit — al importarse registra el wildcard handler que captura
# acciones administrativas en audit_logs. Cero acoplamiento con
# los services de otros módulos.
from app.modules import audit as _audit  # noqa: F401
