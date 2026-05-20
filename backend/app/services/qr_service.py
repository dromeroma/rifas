import io

import qrcode
from qrcode.constants import ERROR_CORRECT_M

from app.core.config import get_settings

settings = get_settings()


def build_verify_url(code: str) -> str:
    return f"{settings.frontend_url}/verify/{code}"


def generate_qr_png(payload: str, box_size: int = 8, border: int = 2) -> bytes:
    """Devuelve un PNG (bytes) listo para embeber en PDF o servir por HTTP."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
