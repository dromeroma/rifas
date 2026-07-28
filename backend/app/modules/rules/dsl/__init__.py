"""DSL del Rules Engine — parser + evaluador."""
from app.modules.rules.dsl.evaluator import (
    EvaluationContext,
    evaluate_condition,
    resolve_action_params,
)
from app.modules.rules.dsl.expressions import evaluate_expression
from app.modules.rules.dsl.operators import OPERATORS
from app.modules.rules.dsl.paths import resolve_path

__all__ = [
    "EvaluationContext",
    "OPERATORS",
    "evaluate_condition",
    "evaluate_expression",
    "resolve_action_params",
    "resolve_path",
]
