"""rules — Rules Engine V1 de Savvy Perks.

Traduce "cuando pase X, haz Y" en configuración que reacciona a los
eventos del bus interno. DSL JSON como fuente de verdad — ver
docs/05-RULES_ENGINE.md.

Superficie pública:

  Modelos:
    Rule, RuleVersion, RuleExecution, ExecutionStatus

  Errores:
    RulesModuleError, RuleNotFoundError, DuplicateRuleCodeError,
    InvalidRuleDefinitionError, UnknownActionError,
    UnknownOperatorError, ExpressionSyntaxError, UnsafeExpressionError,
    ActionExecutionError

  DTOs (DSL + CRUD + dry-run):
    Trigger, Predicate, ConditionGroup, Condition, Action, Limits,
    RuleDefinition, RuleCreateRequest, RuleUpdateRequest, RuleOut,
    RuleExecutionOut, DryRunRequest, DryRunResult

  Service:
    create_rule, update_rule, set_enabled
    get_rule, find_by_code, get_active_version, list_rules_for_event
    evaluate_rules, dry_run

  DSL:
    OPERATORS, resolve_path, evaluate_expression, evaluate_condition,
    resolve_action_params, EvaluationContext

  Actions:
    action_registry — decorator @action_registry.register(type)
    Actions bundled: wallet.credit_points, wallet.credit_cashback,
                     wallet.credit_xp, wallet.issue_voucher

  Handlers:
    handlers.evaluate_rules_on_any_event — wildcard subscriber al bus.
"""
from app.modules.rules import actions, events, handlers  # noqa: F401 -- registra
from app.modules.rules.actions.registry import action_registry
from app.modules.rules.dsl import (
    EvaluationContext,
    OPERATORS,
    evaluate_condition,
    evaluate_expression,
    resolve_action_params,
    resolve_path,
)
from app.modules.rules.errors import (
    ActionExecutionError,
    DuplicateRuleCodeError,
    ExpressionSyntaxError,
    InvalidRuleDefinitionError,
    RuleNotFoundError,
    RulesModuleError,
    UnknownActionError,
    UnknownOperatorError,
    UnsafeExpressionError,
)
from app.modules.rules.models import (
    ExecutionStatus,
    Rule,
    RuleExecution,
    RuleVersion,
)
from app.modules.rules.schemas import (
    Action,
    Condition,
    ConditionGroup,
    DryRunRequest,
    DryRunResult,
    Limits,
    Predicate,
    RuleCreateRequest,
    RuleDefinition,
    RuleExecutionOut,
    RuleOut,
    RuleUpdateRequest,
    Trigger,
)
from app.modules.rules.service import (
    create_rule,
    dry_run,
    evaluate_rules,
    find_by_code,
    get_active_version,
    get_rule,
    list_rules_for_event,
    set_enabled,
    update_rule,
)


__all__ = [
    "Action",
    "ActionExecutionError",
    "Condition",
    "ConditionGroup",
    "DryRunRequest",
    "DryRunResult",
    "DuplicateRuleCodeError",
    "EvaluationContext",
    "ExecutionStatus",
    "ExpressionSyntaxError",
    "InvalidRuleDefinitionError",
    "Limits",
    "OPERATORS",
    "Predicate",
    "Rule",
    "RuleCreateRequest",
    "RuleDefinition",
    "RuleExecution",
    "RuleExecutionOut",
    "RuleNotFoundError",
    "RuleOut",
    "RuleUpdateRequest",
    "RuleVersion",
    "RulesModuleError",
    "Trigger",
    "UnknownActionError",
    "UnknownOperatorError",
    "UnsafeExpressionError",
    "action_registry",
    "actions",
    "create_rule",
    "dry_run",
    "evaluate_condition",
    "evaluate_expression",
    "evaluate_rules",
    "events",
    "find_by_code",
    "get_active_version",
    "get_rule",
    "list_rules_for_event",
    "resolve_action_params",
    "resolve_path",
    "set_enabled",
    "update_rule",
]
