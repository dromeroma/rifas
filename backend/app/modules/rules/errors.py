"""Excepciones del Rules Engine."""
from __future__ import annotations


class RulesModuleError(Exception):
    """Base de errores del módulo rules."""


class RuleNotFoundError(RulesModuleError):
    """No se encontró la regla en el tenant."""


class DuplicateRuleCodeError(RulesModuleError):
    """El code de la regla ya existe en el tenant."""

    def __init__(self, *, tenant_id: int, code: str):
        self.tenant_id = tenant_id
        self.code = code
        super().__init__(
            f"code {code!r} ya existe para tenant {tenant_id}"
        )


class InvalidRuleDefinitionError(RulesModuleError):
    """El DSL no valida (structure/action_type desconocida/expresión mala)."""


class UnknownActionError(RulesModuleError):
    """La acción declarada no está en el ActionRegistry."""

    def __init__(self, action_type: str):
        self.action_type = action_type
        super().__init__(f"action {action_type!r} no está registrada")


class UnknownOperatorError(RulesModuleError):
    """El operador declarado en una condición no está soportado."""

    def __init__(self, op: str):
        self.op = op
        super().__init__(f"operador {op!r} no está soportado")


class ExpressionSyntaxError(RulesModuleError):
    """Sintaxis inválida en una expresión aritmética (`amount_expr`)."""


class UnsafeExpressionError(RulesModuleError):
    """La expresión usa un nodo AST no permitido (llamada a función
    desconocida, atributo, comprensión, etc.). Protección de sandbox."""


class ActionExecutionError(RulesModuleError):
    """Falló la ejecución de una acción en runtime."""

    def __init__(self, action_type: str, cause: BaseException):
        self.action_type = action_type
        self.cause = cause
        super().__init__(
            f"acción {action_type!r} falló: {cause!r}"
        )
