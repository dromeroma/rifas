"""
Servicio de envío de emails vía Resend.

Diseño defensivo: si Resend no está configurado o falla, NO rompe el flujo
principal. Solo registra warning y sigue.

Uso típico:
    await send_ticket_paid_email(
        to_email=customer.email,
        customer_name=customer.full_name,
        raffle=..., ticket=..., numbers=..., prizes=...,
        image_png=image_bytes,
    )
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

RESEND_API_URL = "https://api.resend.com/emails"


async def _send_via_resend(
    *,
    to: list[str],
    subject: str,
    html: str,
    attachments: list[dict[str, Any]] | None = None,
) -> bool:
    """Envía email vía Resend. Devuelve True si se envió, False si se omitió."""
    if not settings.resend_enabled or not settings.resend_api_key:
        log.info("Resend deshabilitado; se omite email a %s (asunto: %s)", to, subject)
        return False

    from_str = f"{settings.resend_from_name} <{settings.resend_from_email}>"
    payload: dict[str, Any] = {
        "from": from_str,
        "to": to,
        "subject": subject,
        "html": html,
    }
    if attachments:
        payload["attachments"] = attachments

    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(RESEND_API_URL, json=payload, headers=headers)
        if r.status_code >= 400:
            log.warning("Resend respondió %s: %s", r.status_code, r.text)
            return False
        log.info("Email enviado a %s (asunto: %s)", to, subject)
        return True
    except Exception as e:
        log.exception("Error enviando email vía Resend: %s", e)
        return False


# ============ Plantillas ============

def _common_styles() -> str:
    return """
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background: #f5f7f6; margin: 0; padding: 0; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #fff; border-radius: 14px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); margin-bottom: 16px; }
    .header { background: linear-gradient(135deg, #0b3d91, #082c6a); color: #fff; padding: 32px 24px; border-radius: 14px 14px 0 0; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .header small { color: rgba(255,255,255,0.7); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; }
    .header .lottery { margin-top: 12px; color: rgba(255,255,255,0.85); font-size: 14px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: #1ec77b; color: #051910; font-weight: 700; font-size: 13px; letter-spacing: 0.02em; margin: 16px 0; }
    .ticket-label { font-size: 56px; font-weight: 800; color: #0b3d91; line-height: 1; margin: 8px 0; }
    .code { font-family: 'Courier New', monospace; font-size: 18px; color: #0b3d91; letter-spacing: 0.04em; font-weight: 700; }
    .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
    .row { padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .row:last-child { border-bottom: 0; }
    .row strong { display: block; color: #1f2937; font-size: 15px; }
    .row small { color: #6b7280; font-size: 13px; }
    .numbers { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0; }
    .num { display: inline-block; padding: 6px 12px; background: #1ec77b; color: #051910; border-radius: 999px; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
    .button { display: inline-block; padding: 12px 24px; background: #0b3d91; color: #fff !important; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; padding: 16px; line-height: 1.6; }
    .footer a { color: #0b3d91; }
    .alert-warn { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 8px; color: #92400e; font-size: 13px; }
    """


def _ticket_paid_html(
    *,
    customer_name: str,
    raffle_name: str,
    ticket_label: str,
    ticket_code: str,
    numbers: list[str],
    prizes: list[dict[str, Any]],
    final_draw_date: str,
    lottery_name: str | None,
    responsible_name: str | None,
    responsible_phone: str | None,
    verify_url: str,
) -> str:
    nums_html = "".join(f'<span class="num">{n}</span>' for n in numbers)
    prizes_html = "".join(
        f"""
        <div class="row">
          <strong>{p['name']}</strong>
          <small>Sorteo: {p['draw_date']}</small>
        </div>
        """
        for p in prizes
    )

    lottery_html = (
        f'<div class="lottery">Juega con: <strong style="color:#fff">{lottery_name}</strong></div>'
        if lottery_name else ""
    )

    responsible_html = ""
    if responsible_name or responsible_phone:
        responsible_html = f"""
        <div class="card">
          <div class="label" style="margin-bottom: 8px;">Responsable de la rifa</div>
          {f'<strong>{responsible_name}</strong>' if responsible_name else ''}
          {f'<br><a href="tel:{responsible_phone}" style="color:#0b3d91;text-decoration:none;">📞 {responsible_phone}</a>' if responsible_phone else ''}
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Tu boleta de {raffle_name}</title>
  <style>{_common_styles()}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <small>BOLETA OFICIAL</small>
      <h1>{raffle_name}</h1>
      {lottery_html}
    </div>

    <div class="card" style="border-radius: 0 0 14px 14px; margin-top: -16px; padding-top: 32px;">
      <p style="margin: 0 0 8px;">Hola <strong>{customer_name}</strong>,</p>
      <p style="margin: 0 0 16px; color: #4b5563;">
        Confirmamos la compra de tu boleta. ¡Gracias por participar!
      </p>

      <div class="badge">✓ PAGO CONFIRMADO</div>

      <div class="row" style="text-align:center; border:0; padding: 16px 0;">
        <small class="label">Tu boleta</small>
        <div class="ticket-label">{ticket_label}</div>
        <div class="code">{ticket_code}</div>
      </div>

      <div style="margin: 24px 0 8px;" class="label">Tus 20 números</div>
      <div class="numbers">{nums_html}</div>

      <div style="margin: 24px 0;">
        <a href="{verify_url}" class="button">Verificar autenticidad</a>
        <p style="margin: 8px 0 0; color: #6b7280; font-size: 12px;">
          Tu boleta también está adjunta como imagen.
        </p>
      </div>
    </div>

    <div class="card">
      <div class="label" style="margin-bottom: 12px;">Premios y fechas</div>
      {prizes_html}
      <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px;">
        <strong>Sorteo final:</strong> {final_draw_date}
      </p>
    </div>

    {responsible_html}

    <div class="footer">
      Este es un comprobante oficial de tu boleta. Guarda este correo.<br>
      Si tienes dudas, contacta al responsable de la rifa.
    </div>
  </div>
</body>
</html>"""


def _admin_pending_payment_html(
    *,
    raffle_name: str,
    ticket_label: str,
    customer_name: str,
    customer_phone: str,
    seller_name: str | None,
    amount: float,
    method: str,
    reference: str | None,
    admin_url: str,
) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Nuevo pago pendiente</title>
  <style>{_common_styles()}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <small>NUEVA NOTIFICACIÓN</small>
      <h1>💳 Pago pendiente de revisar</h1>
    </div>

    <div class="card" style="border-radius: 0 0 14px 14px; margin-top: -16px; padding-top: 32px;">
      <p style="margin: 0 0 16px;">
        Hay un nuevo comprobante de pago esperando tu confirmación.
      </p>

      <div class="row">
        <small class="label">Rifa</small>
        <strong>{raffle_name}</strong>
      </div>
      <div class="row">
        <small class="label">Boleta</small>
        <strong>{ticket_label}</strong>
      </div>
      <div class="row">
        <small class="label">Cliente</small>
        <strong>{customer_name}</strong>
        <small>{customer_phone}</small>
      </div>
      {f'<div class="row"><small class="label">Vendedor</small><strong>{seller_name}</strong></div>' if seller_name else ''}
      <div class="row">
        <small class="label">Monto reportado</small>
        <strong>$ {amount:,.0f} COP</strong>
        <small>vía {method}</small>
      </div>
      {f'<div class="row"><small class="label">Referencia</small><strong>{reference}</strong></div>' if reference else ''}

      <div style="margin-top: 24px;">
        <a href="{admin_url}" class="button">Revisar comprobante</a>
      </div>
    </div>

    <div class="footer">
      Esta es una notificación automática enviada por Boletera.
    </div>
  </div>
</body>
</html>"""


# ============ API pública ============

async def send_ticket_paid_email(
    *,
    to_email: str,
    customer_name: str,
    raffle_name: str,
    ticket_label: str,
    ticket_code: str,
    numbers: list[str],
    prizes: list[dict[str, Any]],
    final_draw_date: str,
    lottery_name: str | None,
    responsible_name: str | None,
    responsible_phone: str | None,
    verify_url: str,
    image_png: bytes | None = None,
) -> bool:
    """Envía email al cliente confirmando su boleta pagada. Adjunta el PNG si se provee."""
    if not to_email:
        return False

    html = _ticket_paid_html(
        customer_name=customer_name,
        raffle_name=raffle_name,
        ticket_label=ticket_label,
        ticket_code=ticket_code,
        numbers=numbers,
        prizes=prizes,
        final_draw_date=final_draw_date,
        lottery_name=lottery_name,
        responsible_name=responsible_name,
        responsible_phone=responsible_phone,
        verify_url=verify_url,
    )

    attachments = None
    if image_png:
        attachments = [{
            "filename": f"boleta-{ticket_code}.png",
            "content": base64.b64encode(image_png).decode("ascii"),
        }]

    return await _send_via_resend(
        to=[to_email],
        subject=f"🎟 Boleta {ticket_label} confirmada · {raffle_name}",
        html=html,
        attachments=attachments,
    )


async def send_admin_pending_payment_email(
    *,
    raffle_name: str,
    ticket_label: str,
    customer_name: str,
    customer_phone: str,
    seller_name: str | None,
    amount: float,
    method: str,
    reference: str | None,
) -> bool:
    """Notifica al admin de un nuevo pago pendiente. Solo se envía si admin_notify_email está configurado."""
    if not settings.admin_notify_email:
        return False

    admin_url = f"{settings.frontend_url}/admin/payments"
    html = _admin_pending_payment_html(
        raffle_name=raffle_name,
        ticket_label=ticket_label,
        customer_name=customer_name,
        customer_phone=customer_phone,
        seller_name=seller_name,
        amount=amount,
        method=method,
        reference=reference,
        admin_url=admin_url,
    )
    return await _send_via_resend(
        to=[settings.admin_notify_email],
        subject=f"💳 Nuevo pago pendiente · Boleta {ticket_label}",
        html=html,
    )


# ============ Aplazamiento y cancelación de rifa ============

def _postpone_html(
    *, customer_name: str, raffle_name: str, new_date: str, old_date: str,
    reason: str | None, responsible_name: str | None, responsible_phone: str | None,
) -> str:
    reason_html = (
        f"<p><strong>Motivo:</strong> {reason}</p>" if reason else ""
    )
    contact_html = ""
    if responsible_name or responsible_phone:
        parts = []
        if responsible_name: parts.append(responsible_name)
        if responsible_phone: parts.append(f"📞 {responsible_phone}")
        contact_html = f"<p style='margin-top:24px;'>Si tienes dudas, contacta a {' · '.join(parts)}.</p>"

    return f"""
<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="font-family:'Inter',sans-serif;background:#0b1116;color:#e6e9ef;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#141c25;border-radius:16px;padding:32px;border:1px solid #2a3441;">
    <div style="background:#3a2d0a;color:#f5b400;padding:10px 14px;border-radius:8px;display:inline-block;font-weight:700;font-size:12px;letter-spacing:0.08em;">
      📅 RIFA APLAZADA
    </div>
    <h1 style="font-size:24px;margin:16px 0 8px;">{raffle_name}</h1>
    <p>Hola {customer_name},</p>
    <p>Te escribimos para informarte que el sorteo final de tu rifa <strong>{raffle_name}</strong> ha sido aplazado.</p>
    <div style="background:#0b1116;border:1px solid #2a3441;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;color:#8290a3;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;">Cambio de fecha</p>
      <p style="margin:0;font-size:14px;"><span style="text-decoration:line-through;color:#8290a3;">{old_date}</span> → <strong style="color:#1e8e54;font-size:18px;">{new_date}</strong></p>
    </div>
    {reason_html}
    <p><strong>Tu boleta sigue activa.</strong> No tienes que hacer nada — los números que tenías asignados se conservan para el nuevo sorteo.</p>
    {contact_html}
    <p style="color:#8290a3;font-size:12px;margin-top:24px;border-top:1px solid #2a3441;padding-top:16px;">
      Esta es una notificación automática enviada por Boletera.
    </p>
  </div>
</body></html>
""".strip()


def _cancel_html(
    *, customer_name: str, raffle_name: str, ticket_label: str, ticket_code: str,
    reason: str, refund_contact: str | None, refund_message: str | None,
    responsible_name: str | None, responsible_phone: str | None,
) -> str:
    refund_contact_html = ""
    if refund_contact:
        refund_contact_html = (
            f"<p><strong>Datos para tu reembolso:</strong> {refund_contact}</p>"
        )
    refund_msg_html = ""
    if refund_message:
        refund_msg_html = f"<p>{refund_message}</p>"
    contact_html = ""
    if responsible_name or responsible_phone:
        parts = []
        if responsible_name: parts.append(responsible_name)
        if responsible_phone: parts.append(f"📞 {responsible_phone}")
        contact_html = f"<p>Responsable: {' · '.join(parts)}</p>"

    return f"""
<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="font-family:'Inter',sans-serif;background:#0b1116;color:#e6e9ef;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#141c25;border-radius:16px;padding:32px;border:1px solid #2a3441;">
    <div style="background:#3a1414;color:#e35d6a;padding:10px 14px;border-radius:8px;display:inline-block;font-weight:700;font-size:12px;letter-spacing:0.08em;">
      ❗ RIFA CANCELADA
    </div>
    <h1 style="font-size:24px;margin:16px 0 8px;">{raffle_name}</h1>
    <p>Hola {customer_name},</p>
    <p>Te escribimos con honestidad: lamentablemente la rifa <strong>{raffle_name}</strong> ha sido cancelada.</p>

    <div style="background:#0b1116;border:1px solid #2a3441;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 4px;color:#8290a3;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;">Tu boleta</p>
      <p style="margin:0;font-size:18px;font-weight:700;">N° {ticket_label} · <span style="font-family:monospace;color:#8290a3;font-size:13px;">{ticket_code}</span></p>
    </div>

    <p><strong>Motivo de la cancelación:</strong></p>
    <p style="background:#0b1116;border-left:3px solid #e35d6a;padding:12px 16px;border-radius:4px;">{reason}</p>

    <h2 style="font-size:16px;margin:24px 0 8px;color:#1e8e54;">Qué pasa con tu dinero</h2>
    {refund_msg_html if refund_msg_html else "<p>Tu pago será reembolsado en su totalidad. Nos pondremos en contacto contigo en los próximos días para coordinar la devolución por el mismo medio en el que pagaste.</p>"}
    {refund_contact_html}

    <p style="margin-top:24px;">Sabemos que esto no es lo que esperabas y te pedimos disculpas sinceras. Gracias por la confianza que depositaste en nosotros — significa mucho.</p>

    {contact_html}

    <p style="color:#8290a3;font-size:12px;margin-top:24px;border-top:1px solid #2a3441;padding-top:16px;">
      Esta es una notificación automática enviada por Boletera. La rifa ha quedado cerrada y no se realizarán sorteos.
    </p>
  </div>
</body></html>
""".strip()


async def send_raffle_postponed_email(
    *,
    to_email: str,
    customer_name: str,
    raffle_name: str,
    new_date: str,
    old_date: str,
    reason: str | None = None,
    responsible_name: str | None = None,
    responsible_phone: str | None = None,
) -> bool:
    if not to_email:
        return False
    html = _postpone_html(
        customer_name=customer_name, raffle_name=raffle_name,
        new_date=new_date, old_date=old_date, reason=reason,
        responsible_name=responsible_name, responsible_phone=responsible_phone,
    )
    return await _send_via_resend(
        to=[to_email],
        subject=f"📅 Tu rifa fue aplazada · {raffle_name}",
        html=html,
    )


async def send_raffle_cancelled_email(
    *,
    to_email: str,
    customer_name: str,
    raffle_name: str,
    ticket_label: str,
    ticket_code: str,
    reason: str,
    refund_contact: str | None = None,
    refund_message: str | None = None,
    responsible_name: str | None = None,
    responsible_phone: str | None = None,
) -> bool:
    if not to_email:
        return False
    html = _cancel_html(
        customer_name=customer_name, raffle_name=raffle_name,
        ticket_label=ticket_label, ticket_code=ticket_code,
        reason=reason, refund_contact=refund_contact, refund_message=refund_message,
        responsible_name=responsible_name, responsible_phone=responsible_phone,
    )
    return await _send_via_resend(
        to=[to_email],
        subject=f"❗ Cancelación · {raffle_name}",
        html=html,
    )
