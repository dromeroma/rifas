"""Service del Rules Engine — CRUD + evaluate_rules + dry_run.

Superficie:

  create_rule(db, tenant_id, actor, request) -> Rule
      Crea Rule + primera RuleVersion + apunta active_version_id.
      Publica rules.rule.published.

  update_rule(db, rule_id, actor, request) -> Rule
      Crea RuleVersion nueva, actualiza active_version_id. Publica
      rules.rule.published con la nueva versión.

  set_enabled(db, rule_id, enabled) -> Rule
      Toggle. Publica rules.rule.disabled cuando pasa a False.

  list_rules_for_event(db, tenant_id, event_type) -> list[Rule]
      Rules enabled del tenant que aplican al event_type.

  evaluate_rules(db, event) -> list[RuleExecution]
      Corazón del motor. Se llama desde el handler universal.
      1. Busca rules aplicables.
      2. Por cada una: chequea limits + cooldown + condiciones.
      3. Ejecuta acciones si pasa.
      4. Emite rules.rule.fired/skipped/errored.
      5. Registra RuleExecution.

  dry_run(db, rule_id, request) -> DryRunResult
      Evalúa la regla contra un evento sintético SIN efectos.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, TYPE_CHECKING

from sqlalchemy import func, select

from app.modules.platform.events import (
    Actor,
    ActorKind,
    Event,
    EventContext,
    Subject,
    publish,
)
from app.modules.rules.actions.registry import action_registry
from app.modules.rules.dsl.evaluator import (
    EvaluationContext,
    evaluate_condition,
    resolve_action_params,
    timed_evaluation,
)
from app.modules.rules.errors import (
    ActionExecutionError,
    DuplicateRuleCodeError,
    InvalidRuleDefinitionError,
    RuleNotFoundError,
    UnknownActionError,
)
from app.modules.rules.events import (
    RULES_RULE_DISABLED,
    RULES_RULE_ERRORED,
    RULES_RULE_FIRED,
    RULES_RULE_PUBLISHED,
    RULES_RULE_SKIPPED,
)
from app.modules.rules.models import (
    ExecutionStatus,
    Rule,
    RuleExecution,
    RuleVersion,
)
from app.modules.rules.schemas import (
    DryRunRequest,
    DryRunResult,
    RuleCreateRequest,
    RuleDefinition,
    RuleUpdateRequest,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────
# Validación del DSL
# ────────────────────────────────────────────────────────────────


def _validate_definition(defn: RuleDefinition) -> None:
    """Segunda capa de validación: actions conocidas."""
    for action in defn.actions:
        if not action_registry.is_known(action.type):
            raise UnknownActionError(action.type)


# ────────────────────────────────────────────────────────────────
# CRUD
# ────────────────────────────────────────────────────────────────


async def get_rule(db: "AsyncSession", *, rule_id: int) -> Rule:
    r = await db.get(Rule, rule_id)
    if r is None:
        raise RuleNotFoundError(f"rule #{rule_id} no existe")
    return r


async def get_active_version(
    db: "AsyncSession", *, rule: Rule,
) -> RuleVersion:
    if rule.active_version_id is None:
        raise InvalidRuleDefinitionError(
            f"rule #{rule.id} sin active_version — regla incompleta"
        )
    v = await db.get(RuleVersion, rule.active_version_id)
    if v is None:
        raise InvalidRuleDefinitionError(
            f"active_version_id {rule.active_version_id} no existe"
        )
    return v


async def find_by_code(
    db: "AsyncSession", *, tenant_id: int, code: str,
) -> Rule | None:
    stmt = select(Rule).where(
        Rule.tenant_id == tenant_id, Rule.code == code,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_rule(
    db: "AsyncSession",
    *,
    tenant_id: int,
    actor: Actor,
    request: RuleCreateRequest,
    created_by_member_id: int | None = None,
) -> Rule:
    """Crea una regla nueva con su primera versión activa."""
    existing = await find_by_code(db, tenant_id=tenant_id, code=request.code)
    if existing is not None:
        raise DuplicateRuleCodeError(tenant_id=tenant_id, code=request.code)

    defn = request.definition
    _validate_definition(defn)

    rule = Rule(
        tenant_id=tenant_id,
        code=request.code,
        name=defn.name,
        description=defn.description,
        category=defn.category,
        enabled=defn.enabled,
        trigger_event_type=defn.trigger.event,
        active_version_id=None,
    )
    db.add(rule)
    await db.flush()

    version = RuleVersion(
        tenant_id=tenant_id,
        rule_id=rule.id,
        version=1,
        dsl=defn.model_dump(mode="json", by_alias=True),
        created_by_member_id=created_by_member_id,
    )
    db.add(version)
    await db.flush()

    rule.active_version_id = version.id

    await publish(
        Event(
            type=RULES_RULE_PUBLISHED,
            tenant_id=tenant_id,
            actor=actor,
            subject=Subject(kind="rule", id=rule.id),
            data={"code": rule.code, "version": 1},
        ),
        db,
    )
    return rule


async def update_rule(
    db: "AsyncSession",
    *,
    rule_id: int,
    actor: Actor,
    request: RuleUpdateRequest,
    updated_by_member_id: int | None = None,
) -> Rule:
    """Crea una RuleVersion nueva y la apunta como activa."""
    rule = await get_rule(db, rule_id=rule_id)
    defn = request.definition
    _validate_definition(defn)

    # Siguiente número de versión.
    max_v = (
        await db.execute(
            select(func.coalesce(func.max(RuleVersion.version), 0))
            .where(RuleVersion.rule_id == rule.id)
        )
    ).scalar_one()

    version = RuleVersion(
        tenant_id=rule.tenant_id,
        rule_id=rule.id,
        version=max_v + 1,
        dsl=defn.model_dump(mode="json", by_alias=True),
        created_by_member_id=updated_by_member_id,
        change_note=request.change_note,
    )
    db.add(version)
    await db.flush()

    rule.name = defn.name
    rule.description = defn.description
    rule.category = defn.category
    rule.enabled = defn.enabled
    rule.trigger_event_type = defn.trigger.event
    rule.active_version_id = version.id

    await publish(
        Event(
            type=RULES_RULE_PUBLISHED,
            tenant_id=rule.tenant_id,
            actor=actor,
            subject=Subject(kind="rule", id=rule.id),
            data={"code": rule.code, "version": version.version},
        ),
        db,
    )
    return rule


async def set_enabled(
    db: "AsyncSession", *, rule_id: int, enabled: bool, actor: Actor,
) -> Rule:
    rule = await get_rule(db, rule_id=rule_id)
    if rule.enabled == enabled:
        return rule
    rule.enabled = enabled
    if not enabled:
        await publish(
            Event(
                type=RULES_RULE_DISABLED,
                tenant_id=rule.tenant_id,
                actor=actor,
                subject=Subject(kind="rule", id=rule.id),
                data={"code": rule.code},
            ),
            db,
        )
    return rule


async def list_rules_for_event(
    db: "AsyncSession", *, tenant_id: int, event_type: str,
) -> list[Rule]:
    """Rules enabled del tenant que aplican al event_type dado."""
    stmt = (
        select(Rule)
        .where(
            Rule.tenant_id == tenant_id,
            Rule.trigger_event_type == event_type,
            Rule.enabled.is_(True),
            Rule.active_version_id.is_not(None),
        )
        .order_by(Rule.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


# ────────────────────────────────────────────────────────────────
# Snapshot loading
# ────────────────────────────────────────────────────────────────


async def _load_customer_snapshot(
    db: "AsyncSession", *, tenant_id: int, customer_id: int | None,
) -> dict[str, Any]:
    """Snapshot minimal del customer para paths `customer.*`.

    En V1 tomamos campos básicos de la tabla `customers` legacy
    (el módulo customer se conecta contra la misma tabla). Post-cutover
    esto se refactoriza para usar la fuente de verdad del módulo.
    """
    if customer_id is None:
        return {}
    row = (
        await db.execute(
            select(
                Customer_legacy.id,
                Customer_legacy.full_name,
                Customer_legacy.email,
                Customer_legacy.phone,
                Customer_legacy.document,
                Customer_legacy.created_at,
            ).where(Customer_legacy.id == customer_id)
        )
    ).one_or_none()
    if row is None:
        return {}
    return {
        "id": row[0],
        "full_name": row[1],
        "email": row[2],
        "phone": row[3],
        "document": row[4],
        "created_at": row[5].isoformat() if row[5] else None,
    }


async def _load_wallet_snapshot(
    db: "AsyncSession", *, tenant_id: int, customer_id: int | None,
) -> dict[str, Any]:
    """Snapshot de balances de la wallet del customer.

    Devuelve `{ points, xp, cashback_cop, ... }` con los tipos que
    existen para esa wallet. Sin wallet = dict vacío.
    """
    if customer_id is None:
        return {}
    from app.modules.wallet.models import Wallet, WalletBalance

    wallet = (
        await db.execute(
            select(Wallet).where(
                Wallet.tenant_id == tenant_id,
                Wallet.customer_id == customer_id,
            )
        )
    ).scalar_one_or_none()
    if wallet is None:
        return {}

    balances = (
        await db.execute(
            select(WalletBalance.balance_type, WalletBalance.amount)
            .where(WalletBalance.wallet_id == wallet.id)
        )
    ).all()
    snap: dict[str, Any] = {"id": wallet.id}
    for balance_type, amount in balances:
        # balance_type es enum; usamos su value como key.
        key = balance_type.value if hasattr(balance_type, "value") else str(balance_type)
        snap[key] = str(amount)
    return snap


def _derive_customer_id(event: Event) -> int | None:
    """Extrae customer_id del evento — de subject o de data."""
    if event.subject.kind == "customer" and event.subject.id is not None:
        try:
            return int(event.subject.id)
        except (TypeError, ValueError):
            return None
    if "customer_id" in event.data:
        try:
            return int(event.data["customer_id"])
        except (TypeError, ValueError):
            return None
    return None


# ────────────────────────────────────────────────────────────────
# Anti-abuse checks
# ────────────────────────────────────────────────────────────────


async def _count_fires(
    db: "AsyncSession",
    *,
    rule_id: int,
    customer_id: int | None,
    since: datetime,
) -> int:
    stmt = (
        select(func.count(RuleExecution.id))
        .where(
            RuleExecution.rule_id == rule_id,
            RuleExecution.status == ExecutionStatus.FIRED,
            RuleExecution.created_at >= since,
            RuleExecution.dry_run.is_(False),
        )
    )
    if customer_id is not None:
        stmt = stmt.where(RuleExecution.customer_id == customer_id)
    return (await db.execute(stmt)).scalar_one() or 0


async def _last_fire_at(
    db: "AsyncSession",
    *,
    rule_id: int,
    customer_id: int | None,
) -> datetime | None:
    stmt = (
        select(func.max(RuleExecution.created_at))
        .where(
            RuleExecution.rule_id == rule_id,
            RuleExecution.status == ExecutionStatus.FIRED,
            RuleExecution.dry_run.is_(False),
        )
    )
    if customer_id is not None:
        stmt = stmt.where(RuleExecution.customer_id == customer_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _limits_check(
    db: "AsyncSession",
    *,
    rule: Rule,
    version: RuleVersion,
    customer_id: int | None,
    now: datetime,
) -> dict[str, Any]:
    """Retorna diagnóstico de límites. `passed=False` si hay bloqueo."""
    dsl = version.dsl or {}
    limits = dsl.get("limits") or {}
    cooldown_seconds = int(dsl.get("cooldown_seconds") or 0)

    result: dict[str, Any] = {"passed": True, "reason": None}

    if customer_id is not None:
        if limits.get("per_customer_per_day"):
            since = now - timedelta(days=1)
            count = await _count_fires(
                db, rule_id=rule.id, customer_id=customer_id, since=since,
            )
            if count >= int(limits["per_customer_per_day"]):
                return {"passed": False, "reason": "per_customer_per_day"}

        if limits.get("per_customer_per_month"):
            since = now - timedelta(days=30)
            count = await _count_fires(
                db, rule_id=rule.id, customer_id=customer_id, since=since,
            )
            if count >= int(limits["per_customer_per_month"]):
                return {"passed": False, "reason": "per_customer_per_month"}

        if limits.get("per_customer_lifetime"):
            count = await _count_fires(
                db,
                rule_id=rule.id,
                customer_id=customer_id,
                since=datetime(1970, 1, 1, tzinfo=timezone.utc),
            )
            if count >= int(limits["per_customer_lifetime"]):
                return {"passed": False, "reason": "per_customer_lifetime"}

    if limits.get("global_per_day"):
        since = now - timedelta(days=1)
        count = await _count_fires(
            db, rule_id=rule.id, customer_id=None, since=since,
        )
        if count >= int(limits["global_per_day"]):
            return {"passed": False, "reason": "global_per_day"}

    if cooldown_seconds > 0:
        last = await _last_fire_at(
            db, rule_id=rule.id, customer_id=customer_id,
        )
        if last is not None:
            elapsed = (now - last).total_seconds()
            if elapsed < cooldown_seconds:
                return {"passed": False, "reason": "cooldown"}

    return result


# ────────────────────────────────────────────────────────────────
# evaluate_rules — corazón del motor
# ────────────────────────────────────────────────────────────────


async def _record_execution(
    db: "AsyncSession",
    *,
    rule: Rule,
    version: RuleVersion,
    event: Event,
    customer_id: int | None,
    status: ExecutionStatus,
    actions_applied: list[dict],
    error: str | None,
    latency_ms: int,
    dry_run: bool = False,
) -> RuleExecution:
    row = RuleExecution(
        tenant_id=rule.tenant_id,
        rule_id=rule.id,
        rule_version_id=version.id,
        event_id=event.id,
        event_type=event.type,
        customer_id=customer_id,
        status=status,
        actions_applied=actions_applied,
        error=error,
        latency_ms=latency_ms,
        dry_run=dry_run,
    )
    db.add(row)
    await db.flush()
    return row


async def _publish_result(
    db: "AsyncSession",
    *,
    rule: Rule,
    event: Event,
    status: ExecutionStatus,
    actions_applied: list[dict],
    error: str | None,
) -> None:
    if status is ExecutionStatus.FIRED:
        etype = RULES_RULE_FIRED
    elif status is ExecutionStatus.ERRORED:
        etype = RULES_RULE_ERRORED
    else:
        etype = RULES_RULE_SKIPPED

    await publish(
        Event(
            type=etype,
            tenant_id=rule.tenant_id,
            actor=Actor(kind=ActorKind.SYSTEM),
            subject=Subject(kind="rule", id=rule.id),
            context=EventContext(
                trigger_event_id=event.id,
                causation_depth=event.context.causation_depth + 1,
            ),
            data={
                "code": rule.code,
                "trigger_event_type": event.type,
                "trigger_event_id": event.id,
                "actions_applied": actions_applied,
                "error": error,
                "status": status.value,
            },
        ),
        db,
    )


async def evaluate_rules(
    db: "AsyncSession", *, event: Event,
) -> list[RuleExecution]:
    """Motor: evalúa todas las reglas del tenant que aplican al evento."""
    if event.tenant_id is None:
        return []
    # Evitar auto-invocación: eventos que emite el propio Rules Engine
    # no disparan reglas.
    if event.type.startswith("rules."):
        return []

    rules = await list_rules_for_event(
        db, tenant_id=event.tenant_id, event_type=event.type,
    )
    if not rules:
        return []

    customer_id = _derive_customer_id(event)
    now = datetime.now(timezone.utc)

    customer_data = await _load_customer_snapshot(
        db, tenant_id=event.tenant_id, customer_id=customer_id,
    )
    wallet_data = await _load_wallet_snapshot(
        db, tenant_id=event.tenant_id, customer_id=customer_id,
    )

    executions: list[RuleExecution] = []
    for rule in rules:
        try:
            version = await get_active_version(db, rule=rule)
        except InvalidRuleDefinitionError:
            logger.warning("rule #%s sin active_version — skip", rule.id)
            continue

        with timed_evaluation() as t:
            actions_applied: list[dict] = []
            error_text: str | None = None
            status: ExecutionStatus

            try:
                # Limits + cooldown
                limits_check = await _limits_check(
                    db, rule=rule, version=version,
                    customer_id=customer_id, now=now,
                )
                if not limits_check["passed"]:
                    status = (
                        ExecutionStatus.COOLED_DOWN
                        if limits_check["reason"] == "cooldown"
                        else ExecutionStatus.RATE_LIMITED
                    )
                else:
                    # Condiciones
                    ctx = EvaluationContext(
                        event=event,
                        customer_data=customer_data,
                        wallet_data=wallet_data,
                        now=now,
                    )
                    dsl = version.dsl or {}
                    conditions = dsl.get("conditions")
                    passed = evaluate_condition(conditions, ctx)

                    if not passed:
                        status = ExecutionStatus.SKIPPED
                    else:
                        # Ejecutar acciones
                        for action in dsl.get("actions", []):
                            action_type = action.get("type")
                            fn = action_registry.get(action_type)
                            if fn is None:
                                raise UnknownActionError(action_type)
                            resolved = resolve_action_params(
                                action.get("params", {}), ctx,
                            )
                            try:
                                summary = await fn(
                                    db=db,
                                    tenant_id=event.tenant_id,
                                    event=event,
                                    params=resolved,
                                    customer_id=customer_id,
                                    trigger_event_id=event.id,
                                )
                            except Exception as exc:
                                raise ActionExecutionError(action_type, exc) from exc
                            actions_applied.append(summary)
                        status = ExecutionStatus.FIRED
            except (ActionExecutionError, UnknownActionError) as exc:
                status = ExecutionStatus.ERRORED
                error_text = str(exc)
                logger.exception(
                    "rule #%s errored evaluating event %s", rule.id, event.id,
                )

        exec_row = await _record_execution(
            db,
            rule=rule,
            version=version,
            event=event,
            customer_id=customer_id,
            status=status,
            actions_applied=actions_applied,
            error=error_text,
            latency_ms=t.latency_ms,
        )
        await _publish_result(
            db,
            rule=rule,
            event=event,
            status=status,
            actions_applied=actions_applied,
            error=error_text,
        )
        executions.append(exec_row)

    return executions


# ────────────────────────────────────────────────────────────────
# Dry-run — sin efectos
# ────────────────────────────────────────────────────────────────


async def dry_run(
    db: "AsyncSession",
    *,
    rule_id: int,
    request: DryRunRequest,
) -> DryRunResult:
    """Corre la regla contra un evento sintético SIN mutar estado.

    - No ejecuta acciones (solo resuelve params).
    - No emite eventos al bus.
    - No escribe RuleExecution.

    Devuelve diagnóstico útil para el editor de reglas.
    """
    rule = await get_rule(db, rule_id=rule_id)
    version = await get_active_version(db, rule=rule)

    synth_event = Event(
        type=request.event_type,
        tenant_id=rule.tenant_id,
        actor=Actor(kind=ActorKind.SYSTEM),
        subject=Subject(
            kind="customer" if request.customer_id else "system",
            id=request.customer_id,
        ),
        data=dict(request.event_data),
    )

    customer_data = await _load_customer_snapshot(
        db, tenant_id=rule.tenant_id, customer_id=request.customer_id,
    )
    wallet_data = await _load_wallet_snapshot(
        db, tenant_id=rule.tenant_id, customer_id=request.customer_id,
    )

    with timed_evaluation() as t:
        ctx = EvaluationContext(
            event=synth_event,
            customer_data=customer_data,
            wallet_data=wallet_data,
            now=datetime.now(timezone.utc),
        )
        dsl = version.dsl or {}
        limits_check = await _limits_check(
            db,
            rule=rule,
            version=version,
            customer_id=request.customer_id,
            now=datetime.now(timezone.utc),
        )
        matched = evaluate_condition(dsl.get("conditions"), ctx)
        actions_planned: list[dict] = []
        error_text: str | None = None

        if not limits_check["passed"]:
            status = (
                ExecutionStatus.COOLED_DOWN
                if limits_check["reason"] == "cooldown"
                else ExecutionStatus.RATE_LIMITED
            )
        elif not matched:
            status = ExecutionStatus.SKIPPED
        else:
            try:
                for action in dsl.get("actions", []):
                    action_type = action.get("type")
                    if not action_registry.is_known(action_type):
                        raise UnknownActionError(action_type)
                    resolved = resolve_action_params(
                        action.get("params", {}), ctx,
                    )
                    actions_planned.append(
                        {"type": action_type, "params": resolved},
                    )
                status = ExecutionStatus.FIRED
            except UnknownActionError as exc:
                status = ExecutionStatus.ERRORED
                error_text = str(exc)

    return DryRunResult(
        status=status,
        matched_conditions=matched,
        actions_planned=actions_planned,
        resolved_paths=ctx.resolved_paths,
        limits_check=limits_check,
        error=error_text,
        latency_ms=t.latency_ms,
    )


# ────────────────────────────────────────────────────────────────
# Compat legacy customer table (deuda documentada, ver rules/README)
# ────────────────────────────────────────────────────────────────

# Import tardío para el snapshot del customer legacy — se retira
# post-cutover cuando el módulo customer sea fuente de verdad.
from app.models.customer import Customer as Customer_legacy  # noqa: E402
