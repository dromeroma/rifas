"""platform.ids — identificadores estables y ordenables por tiempo.

Exporta:
  - new_id(prefix): genera un ID nuevo con prefijo por tipo de recurso.
  - is_valid_id(prefix, value): valida formato.
  - extract_timestamp(id): timestamp del ULID embebido.

Convención de prefijos (ver docs/03-ARCHITECTURE.md):
  cus_ · rwd_ · rul_ · cmp_ · wlt_ · lvl_ · bdg_ · chg_ · txn_ · evt_ ...
"""
from app.modules.platform.ids.ulid import (
    ULID_CHARSET,
    ULID_LEN,
    extract_timestamp,
    is_valid_id,
    is_valid_ulid,
    new_id,
    new_ulid,
)

__all__ = [
    "ULID_CHARSET",
    "ULID_LEN",
    "extract_timestamp",
    "is_valid_id",
    "is_valid_ulid",
    "new_id",
    "new_ulid",
]
