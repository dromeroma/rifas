"""
Envío de notificaciones a clientes y admins vía Email y WhatsApp.

Este módulo es un scaffold: las funciones tienen la interfaz completa
pero la implementación real de HTTP a los proveedores está detrás de
env vars. Sin credenciales, cae a "log-only mode" — imprime el mensaje
en logs sin enviar.

Configuración por env vars:
  RESEND_API_KEY      → https://resend.com (email)
  RESEND_FROM         → "Boletera <no-reply@boletera.co>"
  WHATSAPP_API_URL    → endpoint de tu instancia de Evolution API o similar
  WHATSAPP_API_TOKEN  → token de la API

Cuando pases el dominio y decidamos el proveedor, se conecta con
literalmente 2-3 líneas por función.

Uso típico:
    await send_email(
        to="cliente@x.com",
        subject="Tu boleta 0123",
        html_body="<h1>...</h1>",
    )
    await send_whatsapp(to="+573001234567", body="Recordatorio...")
"""
import logging
import os

import httpx

log = logging.getLogger(__name__)


# ========================== EMAIL ==========================


async def send_email(*, to: str, subject: str, html_body: str, text_body: str | None = None,
                     from_email: str | None = None, reply_to: str | None = None) -> bool:
    """Envía un email transaccional. Retorna True si se envió (o log-only),
    False si falló."""
    api_key = os.environ.get("RESEND_API_KEY")
    from_addr = from_email or os.environ.get("RESEND_FROM") or "Boletera <no-reply@boletera.co>"

    if not api_key:
        # Modo log-only para dev y para producción sin credenciales configuradas.
        # No revienta la app; solo log claro para saber qué se hubiera mandado.
        log.warning(
            "[EMAIL log-only] to=%s subject=%s (RESEND_API_KEY no configurado — email NO enviado)",
            to, subject,
        )
        return True

    payload = {
        "from": from_addr,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        if r.status_code >= 400:
            log.error("Resend error status=%s body=%s", r.status_code, r.text[:500])
            return False
        return True
    except Exception:
        log.exception("Excepción enviando email a %s", to)
        return False


# ========================== WHATSAPP ==========================


async def send_whatsapp(*, to: str, body: str) -> bool:
    """Envía un mensaje de WhatsApp texto simple. Retorna True si OK.

    Diseñado para trabajar con Evolution API (self-hosted, gratis).
    Cambiar la implementación si el proveedor final es diferente.
    """
    api_url = os.environ.get("WHATSAPP_API_URL")
    api_token = os.environ.get("WHATSAPP_API_TOKEN")
    instance = os.environ.get("WHATSAPP_INSTANCE", "default")

    if not api_url or not api_token:
        log.warning(
            "[WHATSAPP log-only] to=%s body=%s... (WHATSAPP_API_* no configurado)",
            to, body[:80],
        )
        return True

    # Normalizar número: quitar '+' y espacios (Evolution API pide "573001234567")
    clean = "".join(c for c in to if c.isdigit())

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{api_url.rstrip('/')}/message/sendText/{instance}",
                headers={"apikey": api_token, "Content-Type": "application/json"},
                json={"number": clean, "text": body},
            )
        if r.status_code >= 400:
            log.error("WhatsApp error status=%s body=%s", r.status_code, r.text[:500])
            return False
        return True
    except Exception:
        log.exception("Excepción enviando WhatsApp a %s", to)
        return False


# ========================== HELPERS específicos del dominio ==========================


async def notify_payment_confirmed(*, customer_email: str, customer_phone: str | None,
                                    raffle_name: str, ticket_labels: list[str],
                                    total_amount: float, verify_urls: list[str]) -> None:
    """Envía confirmación de pago al cliente por email + WhatsApp."""
    tickets_html = "".join(
        f'<li><a href="{u}">Boleta {lbl}</a></li>'
        for lbl, u in zip(ticket_labels, verify_urls)
    )
    html = f"""
    <div style="font-family: system-ui, sans-serif; color: #1a2942; padding: 24px;">
      <h1 style="color: #1ec77b;">¡Pago confirmado! 🎉</h1>
      <p>Compraste con éxito para la rifa <strong>{raffle_name}</strong>.</p>
      <p>Total pagado: <strong>${total_amount:,.0f} COP</strong></p>
      <p>Tus boletas:</p>
      <ul>{tickets_html}</ul>
      <p>Puedes verificar tus boletas en cualquier momento en <a href="{verify_urls[0] if verify_urls else '#'}">Boletera</a>.</p>
      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e2e8f0;" />
      <p style="color: #6b7280; font-size: 12px;">Guarda este correo como comprobante de compra.</p>
    </div>
    """
    await send_email(
        to=customer_email,
        subject=f"Tu boleta para {raffle_name} — confirmada",
        html_body=html,
    )
    if customer_phone:
        labels_str = ", ".join(ticket_labels)
        await send_whatsapp(
            to=customer_phone,
            body=(
                f"¡Pago confirmado! 🎉\n"
                f"Rifa: {raffle_name}\n"
                f"Boletas: {labels_str}\n"
                f"Total: ${total_amount:,.0f} COP\n\n"
                f"Verifica tus boletas: {verify_urls[0] if verify_urls else ''}"
            ),
        )


async def notify_reservation_reminder(*, customer_email: str, customer_phone: str | None,
                                        raffle_name: str, ticket_labels: list[str],
                                        hours_left: int, checkout_url: str | None) -> None:
    """Recordatorio 2h antes de que expire la reserva."""
    labels_str = ", ".join(ticket_labels)
    html = f"""
    <div style="font-family: system-ui, sans-serif; color: #1a2942; padding: 24px;">
      <h1 style="color: #f59e0b;">⏰ Tu reserva está por expirar</h1>
      <p>Tienes reservada(s) para la rifa <strong>{raffle_name}</strong>:</p>
      <p style="font-size: 20px;"><strong>{labels_str}</strong></p>
      <p>Quedan <strong>~{hours_left}h</strong> para completar el pago.</p>
      {'<p><a href="' + checkout_url + '" style="display:inline-block;padding:12px 24px;background:#1ec77b;color:#fff;text-decoration:none;border-radius:8px;">Pagar ahora</a></p>' if checkout_url else ''}
    </div>
    """
    await send_email(
        to=customer_email,
        subject=f"⏰ Tu reserva para {raffle_name} vence en {hours_left}h",
        html_body=html,
    )
    if customer_phone:
        await send_whatsapp(
            to=customer_phone,
            body=(
                f"⏰ Reserva por expirar\n"
                f"Rifa: {raffle_name}\n"
                f"Boletas: {labels_str}\n"
                f"Quedan ~{hours_left}h para pagar."
                + (f"\nPaga aquí: {checkout_url}" if checkout_url else "")
            ),
        )


async def notify_reservation_expired(*, customer_email: str, customer_phone: str | None,
                                       raffle_name: str, ticket_labels: list[str]) -> None:
    """Aviso de que la reserva expiró sin pago."""
    labels_str = ", ".join(ticket_labels)
    html = f"""
    <div style="font-family: system-ui, sans-serif; color: #1a2942; padding: 24px;">
      <h1 style="color: #ef4444;">Reserva expirada</h1>
      <p>Tu reserva para la rifa <strong>{raffle_name}</strong> venció sin recibir pago:</p>
      <p style="font-size: 20px;"><strong>{labels_str}</strong></p>
      <p>Estas boletas están de nuevo disponibles al público. Si aún quieres participar, puedes intentar de nuevo.</p>
    </div>
    """
    await send_email(
        to=customer_email,
        subject=f"Tu reserva de {raffle_name} expiró",
        html_body=html,
    )
    if customer_phone:
        await send_whatsapp(
            to=customer_phone,
            body=(
                f"Tu reserva de {raffle_name} venció.\n"
                f"Boletas liberadas: {labels_str}"
            ),
        )


async def notify_admin_threshold_reached(*, admin_email: str, raffle_name: str,
                                           pct: int, total_paid: int, total: int) -> None:
    """Notifica al admin que la rifa alcanzó el umbral para sortear."""
    html = f"""
    <div style="font-family: system-ui, sans-serif; color: #1a2942; padding: 24px;">
      <h1 style="color: #1ec77b;">🎯 Tu rifa alcanzó el umbral</h1>
      <p>La rifa <strong>{raffle_name}</strong> alcanzó el <strong>{pct}%</strong> de boletas pagadas ({total_paid} de {total}).</p>
      <p>Ya puedes definir la fecha final del sorteo desde tu panel de administración.</p>
      <p><a href="https://rifas-beta.vercel.app/admin/raffles" style="display:inline-block;padding:12px 24px;background:#1ec77b;color:#fff;text-decoration:none;border-radius:8px;">Ir al panel</a></p>
    </div>
    """
    await send_email(
        to=admin_email,
        subject=f"🎯 {raffle_name} alcanzó {pct}% — define fecha de sorteo",
        html_body=html,
    )


async def send_magic_link(*, to_email: str, link_url: str) -> None:
    """Envía magic link para acceso al portal cliente."""
    html = f"""
    <div style="font-family: system-ui, sans-serif; color: #1a2942; padding: 24px;">
      <h1 style="color: #1ec77b;">Accede a tu cuenta Boletera</h1>
      <p>Haz clic en el botón para entrar. Este link es válido por <strong>15 minutos</strong> y solo se puede usar una vez.</p>
      <p style="margin: 24px 0;">
        <a href="{link_url}" style="display:inline-block;padding:14px 28px;background:#1ec77b;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Entrar a mi cuenta</a>
      </p>
      <p style="color: #6b7280; font-size: 12px;">Si no solicitaste este link, ignóralo. Nadie más puede acceder sin él.</p>
    </div>
    """
    await send_email(
        to=to_email,
        subject="Tu link de acceso a Boletera",
        html_body=html,
    )
