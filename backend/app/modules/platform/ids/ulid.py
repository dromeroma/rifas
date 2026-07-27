"""ULID — Universally Unique Lexicographically Sortable Identifier.

Formato:
  - 128 bits en total.
  - 48 bits de timestamp (ms desde epoch UTC).
  - 80 bits aleatorios.
  - Codificado en 26 chars con Base32 de Crockford (mayúsculas,
    excluye I, L, O, U para evitar ambigüedad visual).

Se usa como sufijo de todos los IDs de recursos del sistema con un
prefijo semántico (`cus_`, `rwd_`, etc.) — sortable en el tiempo,
seguro en URL, no correlaciona cardinalidad (no filtra "cuántos
customers hay" como los enteros autoincrement).

Implementado en stdlib para no agregar dependencia nueva.
"""
from __future__ import annotations

import os
import re
import time

# Alfabeto Crockford Base32 — 32 símbolos, sin I/L/O/U.
ULID_CHARSET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_CHAR_TO_INT = {c: i for i, c in enumerate(ULID_CHARSET)}
ULID_LEN = 26

# Un prefijo ID = 2-4 chars alfanuméricos minúscula seguidos de `_`.
_PREFIX_RE = re.compile(r"^[a-z][a-z0-9]{1,3}$")
_FULL_ID_RE = re.compile(rf"^([a-z][a-z0-9]{{1,3}})_([{ULID_CHARSET}]{{{ULID_LEN}}})$")


def _encode(value: int, length: int) -> str:
    """Codifica un entero como cadena Base32 Crockford de longitud fija."""
    if value < 0:
        raise ValueError("ULID no admite valores negativos")
    out = []
    for _ in range(length):
        out.append(ULID_CHARSET[value & 0x1F])
        value >>= 5
    if value != 0:
        raise ValueError(f"valor no cabe en {length} caracteres")
    return "".join(reversed(out))


def _decode(encoded: str) -> int:
    """Decodifica una cadena Base32 Crockford a entero."""
    value = 0
    for ch in encoded:
        try:
            value = (value << 5) | _CHAR_TO_INT[ch]
        except KeyError as exc:
            raise ValueError(f"caracter inválido en ULID: {ch!r}") from exc
    return value


def new_ulid(timestamp_ms: int | None = None) -> str:
    """Genera un ULID nuevo (26 chars, sin prefijo).

    Si `timestamp_ms` no se pasa, usa el reloj actual UTC.
    Sortable lexicográficamente por orden temporal en el mismo ms.
    """
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)
    if timestamp_ms < 0 or timestamp_ms >= (1 << 48):
        raise ValueError("timestamp fuera de rango de 48 bits")

    randomness = int.from_bytes(os.urandom(10), "big")  # 80 bits
    ts_part = _encode(timestamp_ms, 10)
    rnd_part = _encode(randomness, 16)
    return ts_part + rnd_part


def new_id(prefix: str, *, timestamp_ms: int | None = None) -> str:
    """Genera un ID con prefijo semántico.

    Ejemplos:
      new_id("cus")  -> "cus_01H7X3Y8QK2N9M4B5V6C7D8E9F"
      new_id("evt")  -> "evt_01H7X3Y8QK2N9M4B5V6C7D8FGA"
    """
    if not _PREFIX_RE.match(prefix):
        raise ValueError(
            f"prefijo inválido {prefix!r}: 2-4 chars alfanuméricos minúscula, iniciando en letra"
        )
    return f"{prefix}_{new_ulid(timestamp_ms=timestamp_ms)}"


def is_valid_ulid(value: str) -> bool:
    """True si `value` es un ULID de 26 chars válido."""
    if not isinstance(value, str) or len(value) != ULID_LEN:
        return False
    return all(ch in _CHAR_TO_INT for ch in value)


def is_valid_id(value: str, *, prefix: str | None = None) -> bool:
    """Valida un ID con prefijo.

    Si `prefix` se pasa, valida que ese sea el prefijo exacto.
    Sin `prefix`, acepta cualquier prefijo válido.
    """
    if not isinstance(value, str):
        return False
    match = _FULL_ID_RE.match(value)
    if not match:
        return False
    return prefix is None or match.group(1) == prefix


def extract_timestamp(value: str) -> int:
    """Extrae el timestamp (ms desde epoch UTC) de un ULID o ID con prefijo.

    Levanta ValueError si el formato es inválido.
    """
    if "_" in value:
        _, ulid = value.split("_", 1)
    else:
        ulid = value
    if not is_valid_ulid(ulid):
        raise ValueError(f"ULID inválido: {value!r}")
    return _decode(ulid[:10])
