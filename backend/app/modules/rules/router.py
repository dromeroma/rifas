"""Endpoints REST del Rules Engine — `/api/v1/rules/*`.

CRUD de reglas + toggle enabled + dry-run + listar ejecuciones.
Auth ADMIN/SUPER_ADMIN + tenant scope obligatorio.

Se registra en main.py sólo si `perks.admin_api` está ON.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import TenantScope, get_tenant_scope, require_roles
from app.models.user import User, UserRole
from app.modules.platform.events import Actor, ActorKind
from app.modules.rules import (
    DryRunRequest,
    DryRunResult,
    DuplicateRuleCodeError,
    InvalidRuleDefinitionError,
    RuleCreateRequest,
    RuleExecutionOut,
    RuleNotFoundError,
    RuleOut,
    RuleUpdateRequest,
    UnknownActionError,
    UnknownOperatorError,
    create_rule,
    dry_run,
    get_active_version,
    get_rule,
    set_enabled,
    update_rule,
)
from app.modules.rules.models import Rule, RuleExecution


router = APIRouter(prefix="/api/v1/rules", tags=["perks-rules"])


# ────────────────────────────────────────────────────────────────
# Responses
# ────────────────────────────────────────────────────────────────


class RuleDetail(BaseModel):
    """Detalle completo — incluye DSL de la versión activa."""

    rule: RuleOut
    active_dsl: dict | None = None


class RuleListItem(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    category: str | None = None
    enabled: bool
    trigger_event_type: str
    active_version_id: int | None = None


class ListResponse(BaseModel):
    items: list[RuleListItem]
    total: int


class ExecutionsResponse(BaseModel):
    items: list[RuleExecutionOut]


def _actor_from_member(member: User) -> Actor:
    return Actor(kind=ActorKind.MEMBER, id=member.id)


def _dsl_error(exc: Exception) -> HTTPException:
    """Traduce errores del DSL a 422 con detail estructurado."""
    if isinstance(exc, (UnknownActionError, UnknownOperatorError, InvalidRuleDefinitionError)):
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": type(exc).__name__.replace("Error", "").lower(),
                "message": str(exc),
            },
        )
    if isinstance(exc, DuplicateRuleCodeError):
        return HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "duplicate_rule_code",
                "message": str(exc),
                "existing_code": exc.code,
            },
        )
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


async def _load_rule_in_scope(
    db: AsyncSession, *, tenant_id: int, rule_id: int,
) -> Rule:
    try:
        rule = await get_rule(db, rule_id=rule_id)
    except RuleNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    if rule.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rule no encontrada")
    return rule


def _rule_to_out(rule: Rule) -> RuleOut:
    return RuleOut(
        id=rule.id,
        tenant_id=rule.tenant_id,
        code=rule.code,
        name=rule.name,
        description=rule.description,
        category=rule.category,
        enabled=rule.enabled,
        trigger_event_type=rule.trigger_event_type,
        active_version_id=rule.active_version_id,
        active_version=None,   # se llena si el caller quiere
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


# ────────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────────


@router.get("", response_model=ListResponse)
async def list_rules(
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    enabled: bool | None = Query(default=None, description="Filtrar por enabled/disabled"),
    trigger_event_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> ListResponse:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")

    stmt = select(Rule).where(Rule.tenant_id == scope.tenant_id)
    if enabled is not None:
        stmt = stmt.where(Rule.enabled.is_(enabled))
    if trigger_event_type:
        stmt = stmt.where(Rule.trigger_event_type == trigger_event_type.strip())

    from sqlalchemy import func as sa_func

    total = (
        await db.execute(
            select(sa_func.count()).select_from(stmt.subquery())
        )
    ).scalar_one()

    rows = list(
        (
            await db.execute(stmt.order_by(Rule.id.asc()).limit(limit))
        ).scalars().all()
    )
    items = [
        RuleListItem(
            id=r.id,
            tenant_id=r.tenant_id,
            code=r.code,
            name=r.name,
            category=r.category,
            enabled=r.enabled,
            trigger_event_type=r.trigger_event_type,
            active_version_id=r.active_version_id,
        )
        for r in rows
    ]
    return ListResponse(items=items, total=int(total))


@router.get("/{rule_id}", response_model=RuleDetail)
async def get_rule_detail(
    rule_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> RuleDetail:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    rule = await _load_rule_in_scope(
        db, tenant_id=scope.tenant_id, rule_id=rule_id,
    )
    out = _rule_to_out(rule)
    dsl: dict | None = None
    if rule.active_version_id is not None:
        try:
            version = await get_active_version(db, rule=rule)
            dsl = version.dsl
            out = out.model_copy(update={"active_version": version.version})
        except InvalidRuleDefinitionError:
            pass
    return RuleDetail(rule=out, active_dsl=dsl)


@router.post(
    "",
    response_model=RuleOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_rule_endpoint(
    payload: RuleCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> RuleOut:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    try:
        rule = await create_rule(
            db,
            tenant_id=scope.tenant_id,
            actor=_actor_from_member(actor),
            request=payload,
            created_by_member_id=actor.id,
        )
    except (DuplicateRuleCodeError, UnknownActionError,
            UnknownOperatorError, InvalidRuleDefinitionError) as exc:
        raise _dsl_error(exc) from exc
    await db.commit()
    return _rule_to_out(rule)


@router.put("/{rule_id}", response_model=RuleOut)
async def update_rule_endpoint(
    rule_id: int,
    payload: RuleUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> RuleOut:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_rule_in_scope(
        db, tenant_id=scope.tenant_id, rule_id=rule_id,
    )
    try:
        rule = await update_rule(
            db,
            rule_id=rule_id,
            actor=_actor_from_member(actor),
            request=payload,
            updated_by_member_id=actor.id,
        )
    except (UnknownActionError, UnknownOperatorError, InvalidRuleDefinitionError) as exc:
        raise _dsl_error(exc) from exc
    await db.commit()
    return _rule_to_out(rule)


@router.post("/{rule_id}/enable", response_model=RuleOut)
async def enable_rule_endpoint(
    rule_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> RuleOut:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_rule_in_scope(
        db, tenant_id=scope.tenant_id, rule_id=rule_id,
    )
    rule = await set_enabled(
        db, rule_id=rule_id, enabled=True, actor=_actor_from_member(actor),
    )
    await db.commit()
    return _rule_to_out(rule)


@router.post("/{rule_id}/disable", response_model=RuleOut)
async def disable_rule_endpoint(
    rule_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> RuleOut:
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_rule_in_scope(
        db, tenant_id=scope.tenant_id, rule_id=rule_id,
    )
    rule = await set_enabled(
        db, rule_id=rule_id, enabled=False, actor=_actor_from_member(actor),
    )
    await db.commit()
    return _rule_to_out(rule)


@router.post("/{rule_id}/dry-run", response_model=DryRunResult)
async def dry_run_endpoint(
    rule_id: int,
    payload: DryRunRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
) -> DryRunResult:
    """Evalúa la regla sin efectos. No hace commit."""
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_rule_in_scope(
        db, tenant_id=scope.tenant_id, rule_id=rule_id,
    )
    return await dry_run(db, rule_id=rule_id, request=payload)


@router.get(
    "/{rule_id}/executions",
    response_model=ExecutionsResponse,
)
async def list_executions(
    rule_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))],
    scope: Annotated[TenantScope, Depends(get_tenant_scope)],
    limit: int = Query(default=50, ge=1, le=200),
) -> ExecutionsResponse:
    """Últimas ejecuciones de la regla — telemetría para el panel admin."""
    if scope.tenant_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "tenant scope requerido")
    await _load_rule_in_scope(
        db, tenant_id=scope.tenant_id, rule_id=rule_id,
    )

    stmt = (
        select(RuleExecution)
        .where(RuleExecution.rule_id == rule_id)
        .order_by(RuleExecution.id.desc())
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return ExecutionsResponse(
        items=[RuleExecutionOut.model_validate(r) for r in rows],
    )
