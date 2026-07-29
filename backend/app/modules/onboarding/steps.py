"""Definición estática del checklist por defecto.

En Fase 1 los steps son globales — todos los tenants ven la misma lista.
Post-Fase 1: derivar de `TenantVertical` (ej. ISP incluye "conecta tu
CRM Radius" pero un restaurante no).

Cada `StepDef` describe:

  key          — slug estable. Persistido en `onboarding_step.step_key`.
                 NO renombrar sin migración de datos.
  title / desc — copy visible en el UI (español, futuro i18n).
  required     — si es True, bloquea `request_activation` cuando está
                 pending. `skipped` cuenta como cumplido para desbloquear.
  weight       — peso relativo para calcular % de progreso.
  auto_events  — mapping event_type → handler_id. Si algún handler
                 marcha en respuesta al evento, el step queda completed.
  cta          — hint textual para el UI ("Ir a Reglas", "Configurar
                 marca") — sin URLs hardcodeadas para respetar la
                 separación FE/BE.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class StepDef:
    key: str
    title: str
    description: str
    required: bool = True
    weight: int = 1
    auto_events: tuple[str, ...] = field(default_factory=tuple)
    cta: str | None = None


# ────────────────────────────────────────────────────────────────
# Definición canónica del checklist Fase 1
# ────────────────────────────────────────────────────────────────

DEFAULT_STEPS: tuple[StepDef, ...] = (
    StepDef(
        key="brand_setup",
        title="Configura tu marca",
        description=(
            "Ponle nombre, color y logo a tu Perks. Es lo que van a ver "
            "tus clientes en los emails y en el panel."
        ),
        required=True,
        weight=1,
        # Se completa vía handler que inspecciona TenantProfile
        # cuando llega tenant.profile.updated. Ver handlers.py.
        auto_events=("tenant.profile.updated",),
        cta="Configurar marca",
    ),
    StepDef(
        key="first_customer",
        title="Registra tu primer cliente",
        description=(
            "Identifica manualmente a un cliente o dispara una integración "
            "que lo haga. Sin clientes no hay a quién premiar."
        ),
        required=True,
        weight=1,
        auto_events=("customer.identified",),
        cta="Ir a Clientes",
    ),
    StepDef(
        key="first_rule",
        title="Crea tu primera regla",
        description=(
            "Las reglas convierten eventos (venta, visita, cumpleaños) en "
            "premios automáticos. Empieza con una y ve viendo cómo dispara."
        ),
        required=True,
        weight=1,
        auto_events=("rules.rule.published",),
        cta="Ir a Reglas",
    ),
    StepDef(
        key="first_rule_fired",
        title="Espera que tu regla dispare",
        description=(
            "Cuando un evento cumpla las condiciones, la regla se ejecuta. "
            "Este paso se marca solo al primer disparo real."
        ),
        required=False,   # no bloquea activación — es señal, no requisito
        weight=1,
        auto_events=("rules.rule.fired",),
        cta="Ver ejecuciones",
    ),
    StepDef(
        key="first_notification",
        title="Envía tu primer mensaje",
        description=(
            "Crea una plantilla y mándala — puede ser un in-app o email de "
            "prueba. Es lo que cierra el ciclo con tu cliente."
        ),
        required=True,
        weight=1,
        auto_events=("notifications.message.sent",),
        cta="Ir a Notificaciones",
    ),
    StepDef(
        key="go_live",
        title="Activa tu Perks",
        description=(
            "Cuando termines los pasos anteriores, activa el tenant para que "
            "el motor procese en producción. Podés pausarlo cuando quieras."
        ),
        required=True,
        weight=1,
        auto_events=("tenant.activated",),
        cta="Activar",
    ),
)


DEFAULT_STEPS_BY_KEY: dict[str, StepDef] = {s.key: s for s in DEFAULT_STEPS}
