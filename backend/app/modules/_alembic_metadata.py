"""Registro central de módulos cuyos modelos ORM deben verse por Alembic.

Cada módulo nuevo que agregue tablas registra aquí su paquete de modelos
para que `Base.metadata` los conozca y `alembic revision --autogenerate`
los detecte.

Importar `from app.modules import _alembic_metadata` es suficiente: los
imports en este archivo tienen el efecto secundario de registrar las
clases en `Base.metadata`.

Regla: solo import de paquetes de modelos, sin lógica. Un modulo por
línea, alfabetizado.
"""
# platform
from app.modules.platform.events import models as _platform_events_models  # noqa: F401
from app.modules.platform.flags import models as _platform_flags_models  # noqa: F401

# customer
from app.modules.customer import models as _customer_models  # noqa: F401

# wallet
from app.modules.wallet import models as _wallet_models  # noqa: F401

# rules
from app.modules.rules import models as _rules_models  # noqa: F401
