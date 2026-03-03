from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from apps.api.src.common.utils.public_ids import PublicIdDecodeError, decode_public_id, encode_uuid, is_public_id


def test_public_id_roundtrip_uuid4() -> None:
    u = uuid4()
    pid = encode_uuid(u)
    assert is_public_id(pid)
    assert decode_public_id(pid) == u


def test_public_id_is_deterministic() -> None:
    u = uuid4()
    assert encode_uuid(u) == encode_uuid(u)


def test_public_id_decode_rejects_invalid_strings() -> None:
    with pytest.raises(PublicIdDecodeError):
        decode_public_id("")
    with pytest.raises(PublicIdDecodeError):
        decode_public_id("not-a-public-id")
    with pytest.raises(PublicIdDecodeError):
        decode_public_id("a" * 21)
    with pytest.raises(PublicIdDecodeError):
        decode_public_id("a" * 23)
    with pytest.raises(PublicIdDecodeError):
        decode_public_id("a" * 22 + "=")


def test_public_id_tamper_never_decodes_to_original_uuid() -> None:
    u = uuid4()
    pid = encode_uuid(u)
    assert len(pid) == 22
    # Flip the first character to another valid base64url char.
    # (Flipping the tail can keep the same bytes because trailing bits are padding-derived.)
    flipped = ("A" if pid[0] != "A" else "B") + pid[1:]
    try:
        decoded = decode_public_id(flipped)
    except PublicIdDecodeError:
        # Tampering should often fail due to variant/version plausibility checks.
        return

    # If it does decode, it must never round-trip back to the original UUID (the mapping is injective).
    assert decoded != u


def test_public_id_accepts_uuid7_when_available() -> None:
    try:
        from uuid6 import uuid7
    except Exception:
        pytest.skip("uuid6.uuid7 not available")

    u7 = UUID(str(uuid7()))
    pid = encode_uuid(u7)
    assert decode_public_id(pid) == u7
