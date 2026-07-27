"""Unit tests para platform.ids.ulid.

No requieren BD. Prueban:
  - Formato y longitud.
  - Sortabilidad temporal.
  - Validación de prefijos.
  - Extracción de timestamp.
  - Rechazo de valores inválidos.
"""
from __future__ import annotations

import time

import pytest

from app.modules.platform.ids import (
    ULID_CHARSET,
    ULID_LEN,
    extract_timestamp,
    is_valid_id,
    is_valid_ulid,
    new_id,
    new_ulid,
)


class TestNewUlid:
    def test_length_is_26(self):
        assert len(new_ulid()) == ULID_LEN

    def test_all_chars_in_alphabet(self):
        ulid = new_ulid()
        assert all(ch in ULID_CHARSET for ch in ulid)

    def test_unique_across_calls(self):
        ulids = {new_ulid() for _ in range(2000)}
        assert len(ulids) == 2000

    def test_sortable_by_time(self):
        first = new_ulid(timestamp_ms=1_700_000_000_000)
        time.sleep(0.002)
        second = new_ulid(timestamp_ms=1_700_000_000_500)
        assert first < second

    def test_negative_timestamp_rejected(self):
        with pytest.raises(ValueError):
            new_ulid(timestamp_ms=-1)

    def test_timestamp_over_48_bits_rejected(self):
        with pytest.raises(ValueError):
            new_ulid(timestamp_ms=1 << 48)


class TestNewId:
    def test_prefix_and_shape(self):
        rid = new_id("cus")
        assert rid.startswith("cus_")
        assert len(rid) == 4 + ULID_LEN

    @pytest.mark.parametrize("bad", ["", "X", "cus_", "0abc", "TOO_LONG_PREF", "ab-c"])
    def test_invalid_prefixes_rejected(self, bad):
        with pytest.raises(ValueError):
            new_id(bad)

    def test_timestamp_roundtrip(self):
        ts = 1_723_000_000_000
        rid = new_id("evt", timestamp_ms=ts)
        assert extract_timestamp(rid) == ts


class TestIsValidId:
    def test_valid_ids(self):
        assert is_valid_id(new_id("cus"))
        assert is_valid_id(new_id("cus"), prefix="cus")

    def test_wrong_prefix_rejected(self):
        rid = new_id("cus")
        assert not is_valid_id(rid, prefix="evt")

    @pytest.mark.parametrize(
        "value",
        [
            "",
            "not-an-id",
            "cus_short",
            "cus_" + "1" * (ULID_LEN - 1),      # 25 chars
            "cus_" + "1" * (ULID_LEN + 1),      # 27 chars
            "cus_" + "I" * ULID_LEN,             # I no está en Crockford
            None,
            123,
        ],
    )
    def test_invalid_ids_rejected(self, value):
        assert not is_valid_id(value)  # type: ignore[arg-type]


class TestExtractTimestamp:
    def test_from_prefixed_id(self):
        ts = 1_724_000_000_000
        rid = new_id("rwd", timestamp_ms=ts)
        assert extract_timestamp(rid) == ts

    def test_from_raw_ulid(self):
        ts = 1_724_000_000_000
        u = new_ulid(timestamp_ms=ts)
        assert extract_timestamp(u) == ts

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            extract_timestamp("nope")


class TestIsValidUlid:
    def test_valid(self):
        assert is_valid_ulid(new_ulid())

    def test_wrong_length(self):
        assert not is_valid_ulid("SHORT")
        assert not is_valid_ulid("A" * 27)

    def test_forbidden_char(self):
        assert not is_valid_ulid("I" + new_ulid()[1:])
