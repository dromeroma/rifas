"""Unit tests del DSL — operators, paths, expressions, evaluator.

No requieren BD. Ejecutan al parseo/eval del DSL directamente.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.modules.platform.events import Actor, ActorKind, Event, Subject
from app.modules.rules.dsl.evaluator import (
    EvaluationContext,
    evaluate_condition,
    resolve_action_params,
)
from app.modules.rules.dsl.expressions import evaluate_expression
from app.modules.rules.dsl.operators import OPERATORS, get_operator
from app.modules.rules.dsl.paths import resolve_path
from app.modules.rules.errors import (
    ExpressionSyntaxError,
    UnknownOperatorError,
    UnsafeExpressionError,
)


def _event(data=None) -> Event:
    return Event(
        type="pos.sale.completed",
        tenant_id=42,
        actor=Actor(kind=ActorKind.SYSTEM),
        subject=Subject(kind="sale", id=1),
        data=data or {},
    )


def _ctx(event=None, customer=None, wallet=None, now=None) -> EvaluationContext:
    return EvaluationContext(
        event=event or _event(),
        customer_data=customer or {},
        wallet_data=wallet or {},
        now=now or datetime(2026, 7, 28, 15, 30, tzinfo=timezone.utc),
    )


# ────────────────────────────────────────────────────────────────
# Operators
# ────────────────────────────────────────────────────────────────


class TestOperators:
    def test_eq_numeric_tolerant(self):
        assert OPERATORS["eq"]("50", 50) is True
        assert OPERATORS["eq"](50, 50.0) is True

    def test_neq(self):
        assert OPERATORS["neq"]("50", 51) is True

    @pytest.mark.parametrize(
        "op,left,right,expected",
        [
            ("gt", 60, 50, True),
            ("gt", 50, 50, False),
            ("gte", 50, 50, True),
            ("lt", 40, 50, True),
            ("lte", 50, 50, True),
            ("lt", "40", 50, True),   # tolerancia string
        ],
    )
    def test_compare(self, op, left, right, expected):
        assert OPERATORS[op](left, right) is expected

    def test_in(self):
        assert OPERATORS["in"]("silver", ["bronze", "silver", "gold"]) is True
        assert OPERATORS["in"]("platinum", ["bronze", "silver"]) is False

    def test_not_in(self):
        assert OPERATORS["not_in"]("gold", ["bronze"]) is True

    def test_starts_ends_contains(self):
        assert OPERATORS["starts_with"]("hola.mundo", "hola") is True
        assert OPERATORS["ends_with"]("hola.mundo", "mundo") is True
        assert OPERATORS["contains"]("hola.mundo", ".m") is True
        assert OPERATORS["contains"]([1, 2, 3], 2) is True

    def test_matches_regex(self):
        assert OPERATORS["matches"]("abc123", r"[a-z]+\d+") is True
        assert OPERATORS["matches"]("ABC123", r"[a-z]+\d+") is False

    def test_exists_null_empty(self):
        assert OPERATORS["exists"](5, None) is True
        assert OPERATORS["exists"](None, None) is False
        assert OPERATORS["is_null"](None, None) is True
        assert OPERATORS["is_empty"]("", None) is True
        assert OPERATORS["is_empty"]([], None) is True
        assert OPERATORS["is_empty"]([1], None) is False

    def test_get_operator_unknown_raises(self):
        with pytest.raises(UnknownOperatorError):
            get_operator("no_existe")


# ────────────────────────────────────────────────────────────────
# Paths
# ────────────────────────────────────────────────────────────────


class TestPaths:
    def test_data_path(self):
        ctx = _ctx(event=_event({"amount_cop": 55000, "channel": "app"}))
        assert resolve_path("data.amount_cop", ctx) == 55000
        assert resolve_path("data.channel", ctx) == "app"

    def test_missing_path_returns_none(self):
        ctx = _ctx()
        assert resolve_path("data.nope", ctx) is None

    def test_event_top_level(self):
        ctx = _ctx()
        assert resolve_path("event.type", ctx) == "pos.sale.completed"
        assert resolve_path("event.tenant_id", ctx) == 42

    def test_customer_snapshot(self):
        ctx = _ctx(customer={"tier": "silver", "tags": ["vip"]})
        assert resolve_path("customer.tier", ctx) == "silver"
        assert resolve_path("customer.tags", ctx) == ["vip"]

    def test_wallet_snapshot(self):
        ctx = _ctx(wallet={"points": "150", "xp": "500"})
        assert resolve_path("wallet.points", ctx) == "150"

    def test_now_fields(self):
        # 2026-07-28 es martes; day_of_week => "tuesday"
        ctx = _ctx(now=datetime(2026, 7, 28, 15, 30, tzinfo=timezone.utc))
        assert resolve_path("now.day_of_week", ctx) == "tuesday"
        assert resolve_path("now.hour", ctx) == 15
        assert resolve_path("now.month", ctx) == 7
        assert resolve_path("now.year", ctx) == 2026

    def test_invalid_path_no_dot(self):
        ctx = _ctx()
        with pytest.raises(ValueError):
            resolve_path("data", ctx)


# ────────────────────────────────────────────────────────────────
# Expressions (AST sandbox)
# ────────────────────────────────────────────────────────────────


class TestExpressions:
    def test_arithmetic(self):
        ctx = _ctx()
        assert evaluate_expression("2 + 3 * 4", ctx) == 14
        assert evaluate_expression("(10 - 4) / 2", ctx) == 3.0

    def test_functions(self):
        ctx = _ctx()
        assert evaluate_expression("floor(3.9)", ctx) == 3
        assert evaluate_expression("ceil(3.1)", ctx) == 4
        assert evaluate_expression("min(5, 2, 9)", ctx) == 2
        assert evaluate_expression("max(1, 4, 3)", ctx) == 4
        assert evaluate_expression("abs(-7)", ctx) == 7

    def test_with_paths(self):
        ctx = _ctx(event=_event({"amount_cop": 55000}))
        assert evaluate_expression("floor(data.amount_cop / 1000)", ctx) == 55

    def test_forbidden_import(self):
        ctx = _ctx()
        with pytest.raises((ExpressionSyntaxError, UnsafeExpressionError)):
            evaluate_expression("__import__('os')", ctx)

    def test_forbidden_lambda(self):
        ctx = _ctx()
        with pytest.raises((ExpressionSyntaxError, UnsafeExpressionError)):
            evaluate_expression("(lambda: 1)()", ctx)

    def test_forbidden_subscript(self):
        ctx = _ctx()
        with pytest.raises(UnsafeExpressionError):
            evaluate_expression("[1,2,3][0]", ctx)

    def test_forbidden_unknown_function(self):
        ctx = _ctx()
        with pytest.raises(UnsafeExpressionError):
            evaluate_expression("open('/etc/passwd')", ctx)

    def test_syntax_error(self):
        ctx = _ctx()
        with pytest.raises(ExpressionSyntaxError):
            evaluate_expression("2 + ", ctx)


# ────────────────────────────────────────────────────────────────
# Condition evaluation
# ────────────────────────────────────────────────────────────────


class TestEvaluator:
    def test_none_condition_passes(self):
        ctx = _ctx()
        assert evaluate_condition(None, ctx) is True

    def test_simple_predicate(self):
        ctx = _ctx(event=_event({"amount_cop": 55000}))
        cond = {"path": "data.amount_cop", "op": "gte", "value": 50000}
        assert evaluate_condition(cond, ctx) is True

    def test_all_group(self):
        ctx = _ctx(
            event=_event({"amount_cop": 55000}),
            customer={"tier": "silver"},
        )
        cond = {
            "all": [
                {"path": "data.amount_cop", "op": "gte", "value": 50000},
                {"path": "customer.tier", "op": "in", "value": ["silver", "gold"]},
            ],
        }
        assert evaluate_condition(cond, ctx) is True

    def test_any_group(self):
        ctx = _ctx(customer={"tier": "gold"})
        cond = {
            "any": [
                {"path": "customer.tier", "op": "eq", "value": "silver"},
                {"path": "customer.tier", "op": "eq", "value": "gold"},
            ],
        }
        assert evaluate_condition(cond, ctx) is True

    def test_not_group(self):
        ctx = _ctx(customer={"tier": "bronze"})
        cond = {
            "not": {"path": "customer.tier", "op": "eq", "value": "gold"},
        }
        assert evaluate_condition(cond, ctx) is True

    def test_nested(self):
        ctx = _ctx(
            event=_event({"channel": "app", "amount_cop": 30000}),
            customer={"tier": "silver"},
        )
        cond = {
            "all": [
                {
                    "any": [
                        {"path": "data.channel", "op": "eq", "value": "app"},
                        {"path": "data.channel", "op": "eq", "value": "web"},
                    ],
                },
                {"path": "customer.tier", "op": "neq", "value": "bronze"},
            ],
        }
        assert evaluate_condition(cond, ctx) is True

    def test_fails_when_predicate_fails(self):
        ctx = _ctx(event=_event({"amount_cop": 100}))
        cond = {"path": "data.amount_cop", "op": "gte", "value": 50000}
        assert evaluate_condition(cond, ctx) is False


# ────────────────────────────────────────────────────────────────
# resolve_action_params
# ────────────────────────────────────────────────────────────────


class TestResolveActionParams:
    def test_literal_passthrough(self):
        ctx = _ctx()
        params = {"amount": 100, "reason": "welcome"}
        assert resolve_action_params(params, ctx) == params

    def test_expr_prefix(self):
        ctx = _ctx(event=_event({"amount_cop": 60000}))
        params = {"amount": "expr:floor(data.amount_cop / 1000)"}
        out = resolve_action_params(params, ctx)
        assert out["amount"] == 60

    def test_path_prefix(self):
        ctx = _ctx(customer={"tier": "gold"})
        params = {"tier": "path:customer.tier"}
        out = resolve_action_params(params, ctx)
        assert out["tier"] == "gold"

    def test_nested_dict(self):
        ctx = _ctx(event=_event({"amount_cop": 20000}))
        params = {
            "outer": {"inner": "expr:data.amount_cop * 2"},
            "list": [1, "expr:data.amount_cop + 1", 3],
        }
        out = resolve_action_params(params, ctx)
        assert out["outer"]["inner"] == 40000
        assert out["list"] == [1, 20001, 3]
