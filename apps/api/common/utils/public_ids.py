from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import re
from dataclasses import dataclass
from typing import Final
from uuid import RFC_4122, UUID

_PUBLIC_ID_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9_-]{22}$")


@dataclass(frozen=True, slots=True)
class PublicIdDecodeError(ValueError):
    message: str = "Invalid public id"

    def __str__(self) -> str:  # pragma: no cover
        return self.message


def is_public_id(value: str) -> bool:
    return bool(_PUBLIC_ID_RE.fullmatch((value or "").strip()))


def _xor8(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b, strict=True))


def _round_f(*, secret: bytes, round_idx: int, right8: bytes) -> bytes:
    # Feistel round function: HMAC(secret, round_idx || right) -> first 8 bytes.
    msg = round_idx.to_bytes(1, byteorder="big", signed=False) + right8
    return hmac.new(secret, msg, hashlib.sha256).digest()[:8]


def _feistel_encrypt_16(*, block16: bytes, secret: bytes, rounds: int) -> bytes:
    if len(block16) != 16:
        raise ValueError("Expected 16-byte block")
    if rounds < 4:
        raise ValueError("rounds must be >= 4")

    left = block16[:8]
    right = block16[8:]
    for i in range(rounds):
        next_left = right
        next_right = _xor8(left, _round_f(secret=secret, round_idx=i, right8=right))
        left, right = next_left, next_right
    return left + right


def _feistel_decrypt_16(*, block16: bytes, secret: bytes, rounds: int) -> bytes:
    if len(block16) != 16:
        raise ValueError("Expected 16-byte block")
    if rounds < 4:
        raise ValueError("rounds must be >= 4")

    left = block16[:8]
    right = block16[8:]
    for i in reversed(range(rounds)):
        prev_right = left
        prev_left = _xor8(right, _round_f(secret=secret, round_idx=i, right8=left))
        left, right = prev_left, prev_right
    return left + right


def _get_public_id_secret_bytes() -> bytes:
    # Imported lazily to avoid circular imports during app bootstrap.
    from apps.api.config import get_settings

    secret = get_settings().public_id.secret.get_secret_value()
    if not secret:
        # In development/test the secret may be empty; still allow encoding to work
        # deterministically for local usage. Production should always set it.
        secret = "dev-public-id-secret"
    return secret.encode("utf-8")


def _get_public_id_rounds() -> int:
    from apps.api.config import get_settings

    rounds = int(get_settings().public_id.rounds)
    if rounds < 4:
        return 4
    if rounds > 16:
        return 16
    return rounds


def encode_uuid(value: UUID) -> str:
    secret = _get_public_id_secret_bytes()
    rounds = _get_public_id_rounds()
    block = _feistel_encrypt_16(block16=value.bytes, secret=secret, rounds=rounds)
    return base64.urlsafe_b64encode(block).decode("ascii").rstrip("=")


def decode_public_id(value: str) -> UUID:
    raw = (value or "").strip()
    if not is_public_id(raw):
        raise PublicIdDecodeError("Invalid public id format")

    pad = "=" * (-len(raw) % 4)
    try:
        data = base64.urlsafe_b64decode(raw + pad)
    except (binascii.Error, ValueError, TypeError) as e:  # pragma: no cover
        raise PublicIdDecodeError("Base64 decode failed") from e

    if len(data) != 16:
        raise PublicIdDecodeError(f"Expected 16 bytes, got {len(data)}")

    secret = _get_public_id_secret_bytes()
    rounds = _get_public_id_rounds()
    plain = _feistel_decrypt_16(block16=data, secret=secret, rounds=rounds)

    try:
        u = UUID(bytes=plain)
    except (binascii.Error, ValueError, TypeError) as e:  # pragma: no cover
        raise PublicIdDecodeError("UUID construction failed") from e

    # Basic plausibility checks: RFC4122 variant + allow only v4/v7 to reduce random collisions.
    # (We use uuid7 by default and uuid4 fallback in ids.uuid7().)
    if u.variant != RFC_4122:
        raise PublicIdDecodeError(f"UUID variant mismatch: {u.variant!r}")
    if u.version not in (4, 7):
        raise PublicIdDecodeError(f"UUID version {u.version} not in (4, 7)")

    return u
