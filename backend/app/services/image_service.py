"""
Genera una imagen PNG premium de la boleta para compartir por WhatsApp.

Layout (1080×1920, vertical 9:16) organizado:
  HEADER azul: BOLETA OFICIAL · nombre rifa · lotería · fecha · responsable + contacto
  Card grande verde (esquina derecha) con el número de la boleta
  CANCHA con 20 chips (formación 3-4-3 por mitad)
  PREMIOS compactos
  QR + código + propietario
  Footer con leyenda de verificación
"""

import io
import os
from typing import List

from PIL import Image, ImageDraw, ImageFont

from app.services.qr_service import build_verify_url, generate_qr_png

# Dimensiones
W, H = 1080, 1920

# Formación de fútbol: 10 por mitad (3-4-3) = 20 total
HALF_FORMATION = [3, 4, 3]

# Paleta
COLOR_HEADER_BG = (11, 61, 145)
COLOR_TEXT_DARK = (28, 36, 52)
COLOR_TEXT_LIGHT = (255, 255, 255)
COLOR_MUTED = (110, 120, 138)
COLOR_HEADER_MUTED = (200, 215, 240)
COLOR_LINE = (228, 232, 240)
COLOR_GRASS = (30, 142, 84)
COLOR_CHIP_BG = (255, 255, 255)
COLOR_CHIP_FG = (11, 61, 145)
COLOR_ACCENT = (30, 199, 123)
COLOR_PAID_STAMP = (220, 38, 38, 200)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Carga la primera fuente Latin disponible (Segoe UI / Arial / DejaVu)."""
    candidates = (
        [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
        if bold
        else [
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    )
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _measure(d: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    b = d.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _truncate(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


# ============ Cancha ============

def _draw_field(canvas: Image.Image, x: int, y: int, w: int, h: int, grass: tuple[int, int, int]):
    d = ImageDraw.Draw(canvas)
    grass_dark = tuple(max(0, c - 14) for c in grass)
    d.rectangle([x, y, x + w, y + h], fill=grass)
    band_h = h / 12
    for i in range(12):
        if i % 2 == 0:
            d.rectangle([x, y + i * band_h, x + w, y + (i + 1) * band_h], fill=grass_dark)

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    lw = 4
    lc = (255, 255, 255, 230)
    od.rectangle([x, y, x + w, y + h], outline=lc, width=lw)
    od.line([(x, y + h / 2), (x + w, y + h / 2)], fill=lc, width=lw)
    cr = min(w, h) * 0.10
    od.ellipse([x + w / 2 - cr, y + h / 2 - cr, x + w / 2 + cr, y + h / 2 + cr], outline=lc, width=lw)
    od.ellipse([x + w / 2 - 6, y + h / 2 - 6, x + w / 2 + 6, y + h / 2 + 6], fill=lc)
    aw = int(w * 0.55); ah = int(h * 0.10)
    od.rectangle([x + (w - aw) // 2, y, x + (w + aw) // 2, y + ah], outline=lc, width=lw)
    od.rectangle([x + (w - aw) // 2, y + h - ah, x + (w + aw) // 2, y + h], outline=lc, width=lw)
    canvas.paste(overlay, (0, 0), overlay)


def _layout_half(fx: float, fy: float, fw: float, fh: float, side: str) -> List[tuple[float, float]]:
    coords = []
    half_h = fh / 2
    rows = HALF_FORMATION
    band_h = half_h / (len(rows) + 0.6)
    for r_idx, count in enumerate(rows):
        offset = band_h * (r_idx + 1)
        cy = fy + fh / 2 - offset if side == "top" else fy + fh / 2 + offset
        for k in range(count):
            cx = fx + fw * (k + 1) / (count + 1)
            coords.append((cx, cy))
    return coords


def _draw_chip(canvas: Image.Image, cx: float, cy: float, number: str, r: int = 38):
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([cx - r + 2, cy - r + 4, cx + r + 2, cy + r + 4], fill=(0, 0, 0, 90))
    canvas.paste(shadow, (0, 0), shadow)
    d = ImageDraw.Draw(canvas)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=COLOR_CHIP_BG, outline=COLOR_CHIP_FG, width=4)
    f = _font(26, bold=True)
    tw, th = _measure(d, number, f)
    d.text((cx - tw / 2, cy - th / 2 - 3), number, fill=COLOR_CHIP_FG, font=f)


def _draw_paid_stamp(canvas: Image.Image, cx: float, cy: float):
    stamp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(stamp)
    sw, sh = 620, 170
    sx, sy = cx - sw / 2, cy - sh / 2
    sd.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=22, outline=COLOR_PAID_STAMP, width=8)
    sd.rounded_rectangle([sx + 8, sy + 8, sx + sw - 8, sy + sh - 8], radius=18, outline=COLOR_PAID_STAMP, width=3)
    f = _font(96, bold=True)
    tw, th = _measure(sd, "PAGADA", f)
    sd.text((sx + (sw - tw) / 2, sy + (sh - th) / 2 - 12), "PAGADA", fill=COLOR_PAID_STAMP, font=f)
    stamp = stamp.rotate(-12, resample=Image.BICUBIC, expand=False)
    canvas.paste(stamp, (0, 0), stamp)


# ============ Build principal ============

def build_ticket_image(
    *,
    raffle_name: str,
    ticket_label: str,
    ticket_code: str,
    numbers: List[str],
    prizes: List[dict],
    customer_name: str | None = None,
    is_paid: bool = False,
    primary_color: str | None = "#1e8e54",
    lottery_name: str | None = None,
    responsible_name: str | None = None,
    responsible_phone: str | None = None,
    final_draw_date: str | None = None,
    verify_base_url: str | None = None,
) -> bytes:
    if len(numbers) != 20:
        raise ValueError("se esperan exactamente 20 números")

    grass = _hex_to_rgb(primary_color) if primary_color else COLOR_GRASS
    canvas = Image.new("RGB", (W, H), (248, 250, 252))
    draw = ImageDraw.Draw(canvas, "RGBA")

    PAD = 48

    # ============ HEADER (260px) ============
    header_h = 260
    draw.rectangle([0, 0, W, header_h], fill=COLOR_HEADER_BG)
    # Banda accent
    draw.rectangle([0, header_h, W, header_h + 6], fill=COLOR_ACCENT)

    f_label = _font(18, bold=True)
    f_title = _font(46, bold=True)
    f_meta = _font(22)
    f_small = _font(18)

    draw.text((PAD, 28), "BOLETA OFICIAL", fill=COLOR_HEADER_MUTED, font=f_label)
    draw.text((PAD, 56), _truncate(raffle_name, 28), fill=COLOR_TEXT_LIGHT, font=f_title)

    if lottery_name:
        draw.text((PAD, 122), f"Juega con: {_truncate(lottery_name, 30)}",
                  fill=COLOR_HEADER_MUTED, font=f_meta)
    if final_draw_date:
        draw.text((PAD, 158), f"Sorteo final: {final_draw_date}",
                  fill=(165, 185, 225), font=f_small)
    if responsible_name:
        draw.text((PAD, 196), f"Responsable: {_truncate(responsible_name, 26)}",
                  fill=(165, 185, 225), font=f_small)
    if responsible_phone:
        draw.text((PAD, 222), f"Contacto: {responsible_phone}",
                  fill=(165, 185, 225), font=f_small)

    # Card de número de boleta
    card_w, card_h = 250, 150
    card_x = W - card_w - PAD
    card_y = 56
    sh_overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh_overlay)
    sd.rounded_rectangle([card_x + 6, card_y + 10, card_x + card_w + 6, card_y + card_h + 10],
                          radius=22, fill=(0, 0, 0, 100))
    canvas.paste(sh_overlay, (0, 0), sh_overlay)
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                            radius=22, fill=COLOR_ACCENT)
    draw.text((card_x + 22, card_y + 14), "BOLETA", fill=(8, 60, 38), font=f_label)
    f_huge = _font(78, bold=True)
    tw, _ = _measure(draw, ticket_label, f_huge)
    draw.text((card_x + (card_w - tw) / 2, card_y + 44), ticket_label,
              fill=(8, 60, 38), font=f_huge)

    # ============ CANCHA ============
    field_margin = 48
    field_y = header_h + 90              # 350
    field_h = 820
    field_x = field_margin
    field_w = W - 2 * field_margin

    bg = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    bo = ImageDraw.Draw(bg)
    bo.rounded_rectangle([field_x - 6, field_y - 6, field_x + field_w + 6, field_y + field_h + 6],
                          radius=18, fill=(0, 0, 0, 60))
    canvas.paste(bg, (0, 0), bg)

    _draw_field(canvas, field_x, field_y, field_w, field_h, grass)
    draw = ImageDraw.Draw(canvas, "RGBA")

    top = _layout_half(field_x, field_y, field_w, field_h, "top")
    bot = _layout_half(field_x, field_y, field_w, field_h, "bottom")
    for (cx, cy), n in zip(top + bot, numbers):
        _draw_chip(canvas, cx, cy, n, r=38)

    if is_paid:
        _draw_paid_stamp(canvas, field_x + field_w / 2, field_y + field_h / 2)

    draw = ImageDraw.Draw(canvas, "RGBA")

    # ============ PREMIOS ============
    sect_y = field_y + field_h + 36       # 350 + 820 + 36 = 1206
    draw.text((PAD, sect_y), "PREMIOS", fill=COLOR_HEADER_BG, font=_font(22, bold=True))
    draw.line([(PAD, sect_y + 36), (PAD + 200, sect_y + 36)], fill=COLOR_LINE, width=3)

    py = sect_y + 56
    f_prize_name = _font(22, bold=True)
    f_prize_date = _font(18)
    for p in prizes[:4]:
        draw.ellipse([PAD, py + 6, PAD + 16, py + 22], fill=COLOR_ACCENT)
        draw.text((PAD + 28, py), _truncate(p["name"], 36),
                  fill=COLOR_TEXT_DARK, font=f_prize_name)
        draw.text((PAD + 28, py + 30), f"Sorteo: {p['draw_date']}",
                  fill=COLOR_MUTED, font=f_prize_date)
        py += 60
    # py final aprox: 1262 + 4*60 = 1502

    # ============ QR + CODE ============
    qr_section_y = py + 24                # ~1526
    qr_size = 200
    qr_x = PAD

    qr_url = (
        f"{verify_base_url}/verify/{ticket_code}"
        if verify_base_url else build_verify_url(ticket_code)
    )
    qr_png = generate_qr_png(qr_url, box_size=9, border=1)
    qr_img = Image.open(io.BytesIO(qr_png)).convert("RGB").resize((qr_size, qr_size))

    sh2 = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sdd = ImageDraw.Draw(sh2)
    sdd.rounded_rectangle(
        [qr_x - 10 + 4, qr_section_y - 10 + 6,
         qr_x + qr_size + 10 + 4, qr_section_y + qr_size + 10 + 6],
        radius=12, fill=(0, 0, 0, 70),
    )
    canvas.paste(sh2, (0, 0), sh2)
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle(
        [qr_x - 10, qr_section_y - 10, qr_x + qr_size + 10, qr_section_y + qr_size + 10],
        radius=12, fill=COLOR_CHIP_BG,
    )
    canvas.paste(qr_img, (qr_x, qr_section_y))

    # Info a la derecha del QR
    info_x = qr_x + qr_size + 36
    draw.text((info_x, qr_section_y), "CÓDIGO", fill=COLOR_MUTED, font=_font(15, bold=True))
    draw.text((info_x, qr_section_y + 20), ticket_code,
              fill=COLOR_HEADER_BG, font=_font(28, bold=True))

    if customer_name:
        draw.text((info_x, qr_section_y + 72), "PROPIETARIO", fill=COLOR_MUTED, font=_font(15, bold=True))
        draw.text((info_x, qr_section_y + 92), _truncate(customer_name, 22),
                  fill=COLOR_TEXT_DARK, font=_font(22, bold=True))

    draw.text((info_x, qr_section_y + 142), "ESCANEA EL QR", fill=COLOR_MUTED, font=_font(13, bold=True))
    draw.text((info_x, qr_section_y + 160), "para verificar autenticidad",
              fill=COLOR_TEXT_DARK, font=_font(15))

    # ============ FOOTER ============
    footer_y = qr_section_y + qr_size + 36   # ~1762
    if footer_y < H - 40:
        draw.line([(PAD, footer_y), (W - PAD, footer_y)], fill=COLOR_LINE, width=2)
        draw.text(
            (PAD, footer_y + 12),
            "Esta boleta solo es válida con el QR original y la confirmación de pago.",
            fill=COLOR_MUTED, font=_font(14),
        )

    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
