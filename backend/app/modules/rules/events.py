"""Catálogo de eventos que publica el Rules Engine.

Convención `rules.<entity>.<action>` en pasado, ver docs/04-EVENTS.md.
"""
from __future__ import annotations


RULES_RULE_PUBLISHED = "rules.rule.published"
RULES_RULE_DISABLED = "rules.rule.disabled"

# Emitido tras cada evaluación exitosa (condiciones OK + acciones
# ejecutadas). `data` incluye rule_id, event_id, actions_applied.
RULES_RULE_FIRED = "rules.rule.fired"

# Condiciones no pasaron o rate-limit/cooldown cortó. Útil para
# telemetría del admin (por qué mi regla no dispara).
RULES_RULE_SKIPPED = "rules.rule.skipped"

# Alguna acción falló durante la ejecución.
RULES_RULE_ERRORED = "rules.rule.errored"


ALL: tuple[str, ...] = (
    RULES_RULE_PUBLISHED,
    RULES_RULE_DISABLED,
    RULES_RULE_FIRED,
    RULES_RULE_SKIPPED,
    RULES_RULE_ERRORED,
)
