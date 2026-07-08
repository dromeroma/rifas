"""
Cifrado simétrico para secretos sensibles (llaves privadas Wompi, etc.).

Usa Fernet (AES-128-CBC + HMAC-SHA256) de la librería `cryptography`.
La master key se obtiene de la env var CRYPTO_KEY:
  - En producción DEBE estar seteada.
  - Si no está seteada, cae a un default DEV-ONLY con warning fuerte
    para no romper el arranque local.

Cambiar CRYPTO_KEY invalida TODOS los secretos guardados — hay que
re-cifrarlos con la nueva llave. Nunca cambiar en caliente sin plan
de migración.

Uso típico:
    from app.services.crypto_service import encrypt, decrypt
    enc = encrypt("sk_prod_xxx")            # persist en BD
    plain = decrypt(enc) if enc else None   # al momento de usar
"""
import os
import warnings

from cryptography.fernet import Fernet, InvalidToken

_DEV_KEY = "0Y-JzPq4bIkG-Y8kCP-Rj8YBcv8DFAaCF9wPKkVc6E4="  # Solo dev; NO usar en prod


def _get_key() -> bytes:
    k = os.environ.get("CRYPTO_KEY")
    if not k:
        warnings.warn(
            "CRYPTO_KEY no está seteada — usando DEV_KEY. NO USAR EN PRODUCCIÓN. "
            "Genera una con: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'",
            RuntimeWarning,
            stacklevel=2,
        )
        k = _DEV_KEY
    return k.encode("utf-8") if isinstance(k, str) else k


_fernet: Fernet | None = None


def _fernet_instance() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_get_key())
    return _fernet


def encrypt(plain: str) -> str:
    """Cifra un string. Retorna base64 URL-safe seguro para persistir en varchar."""
    if plain is None:
        return None
    return _fernet_instance().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt(enc: str) -> str:
    """Descifra. Levanta InvalidToken si la llave cambió o el ciphertext está roto."""
    if enc is None:
        return None
    try:
        return _fernet_instance().decrypt(enc.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("no se pudo descifrar: llave incorrecta o valor corrupto") from e
