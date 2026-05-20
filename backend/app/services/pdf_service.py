"""
Genera el PDF de una boleta con diseño vertical de cancha de fútbol.

10 números en la mitad superior (formación 3-4-3) y 10 en la mitad inferior.
Sin porteros, sin árbitros — sólo los 20 jugadores.
"""

import io
from typing import List

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A6
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.services.qr_service import build_verify_url, generate_qr_png

# Formación 3-4-3 para 10 jugadores por mitad
# (filas por mitad, contadas DESDE el centro hacia afuera)
HALF_FORMATION = [3, 4, 3]  # delanteros, medios, defensas (suman 10)


def _draw_field(c: canvas.Canvas, x: float, y: float, w: float, h: float, primary: str):
    """Dibuja el rectángulo del campo, líneas y círculo central."""
    grass = HexColor(primary or "#1b8b3b")
    line = white
    c.setFillColor(grass)
    c.rect(x, y, w, h, stroke=0, fill=1)

    c.setStrokeColor(line)
    c.setLineWidth(1.2)
    # Bordes
    c.rect(x, y, w, h, stroke=1, fill=0)
    # Línea media
    c.line(x, y + h / 2, x + w, y + h / 2)
    # Círculo central
    c.circle(x + w / 2, y + h / 2, min(w, h) * 0.08, stroke=1, fill=0)
    # Áreas grandes (decorativas)
    area_w = w * 0.55
    area_h = h * 0.12
    c.rect(x + (w - area_w) / 2, y, area_w, area_h, stroke=1, fill=0)
    c.rect(x + (w - area_w) / 2, y + h - area_h, area_w, area_h, stroke=1, fill=0)


def _draw_player_chip(c: canvas.Canvas, cx: float, cy: float, number: str, r: float = 7.5 * mm):
    c.setFillColor(white)
    c.setStrokeColor(HexColor("#0b3d91"))
    c.setLineWidth(0.8)
    c.circle(cx, cy, r, stroke=1, fill=1)
    c.setFillColor(HexColor("#0b3d91"))
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(cx, cy - 2.5, number)


def _layout_half(field_x: float, field_y: float, w: float, h: float, side: str) -> List[tuple[float, float]]:
    """
    Devuelve las 10 coordenadas (x, y) para una mitad.
    `side` = 'top' o 'bottom'. Las filas se distribuyen entre la línea media y el borde.
    """
    coords: List[tuple[float, float]] = []
    half_h = h / 2
    # Subdividimos la mitad en 3 filas (3-4-3). La primera fila más cercana al centro.
    rows = HALF_FORMATION
    n_rows = len(rows)
    band_h = half_h / (n_rows + 0.5)  # margen
    for r_idx, count in enumerate(rows):
        # offset desde la línea media
        offset = band_h * (r_idx + 1)
        if side == "top":
            y = field_y + h / 2 + offset
        else:
            y = field_y + h / 2 - offset
        # repartir `count` jugadores horizontalmente
        for k in range(count):
            x = field_x + w * (k + 1) / (count + 1)
            coords.append((x, y))
    return coords


def build_ticket_pdf(
    *,
    raffle_name: str,
    ticket_label: str,
    ticket_code: str,
    qr_payload: str,
    numbers: List[str],
    prizes: List[dict],
    primary_color: str | None = "#1b8b3b",
) -> bytes:
    """
    `numbers` debe tener exactamente 20 elementos en orden visual:
      [0..9]  = mitad superior (de centro a borde)
      [10..19] = mitad inferior (de centro a borde)
    """
    if len(numbers) != 20:
        raise ValueError("se esperan exactamente 20 números")

    buf = io.BytesIO()
    page_w, page_h = A6
    c = canvas.Canvas(buf, pagesize=A6)

    # Header
    c.setFillColor(HexColor("#0b3d91"))
    c.rect(0, page_h - 18 * mm, page_w, 18 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(page_w / 2, page_h - 8 * mm, raffle_name[:38])
    c.setFont("Helvetica", 7)
    c.drawString(5 * mm, page_h - 14 * mm, f"Boleta {ticket_label}")
    c.drawRightString(page_w - 5 * mm, page_h - 14 * mm, f"Código: {ticket_code}")

    # Campo
    margin = 5 * mm
    field_x = margin
    field_y = 32 * mm
    field_w = page_w - 2 * margin
    field_h = page_h - field_y - 22 * mm
    _draw_field(c, field_x, field_y, field_w, field_h, primary_color or "#1b8b3b")

    # Jugadores arriba (10) y abajo (10)
    top = _layout_half(field_x, field_y, field_w, field_h, "top")
    bot = _layout_half(field_x, field_y, field_w, field_h, "bottom")
    coords = top + bot
    for (x, y), n in zip(coords, numbers):
        _draw_player_chip(c, x, y, n)

    # Footer: QR + premios
    qr_png = generate_qr_png(build_verify_url(ticket_code))
    qr_size = 22 * mm
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(io.BytesIO(qr_png)), margin, 6 * mm, qr_size, qr_size, mask="auto")

    c.setFillColor(HexColor("#222"))
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(margin + qr_size + 4 * mm, 6 * mm + qr_size - 3, "PREMIOS")
    c.setFont("Helvetica", 6.8)
    y = 6 * mm + qr_size - 8
    for p in prizes[:5]:
        line = f"• {p['name']} — {p['draw_date']}"
        c.drawString(margin + qr_size + 4 * mm, y, line[:55])
        y -= 8
    c.setFont("Helvetica-Oblique", 6)
    c.drawString(margin, 3 * mm, "Verifica autenticidad escaneando el QR.")

    c.showPage()
    c.save()
    return buf.getvalue()
