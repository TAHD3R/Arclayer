from __future__ import annotations

import base64
import hmac
import os
import struct
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha1
from typing import Final

_DEFAULT_DIGITS: Final[int] = 6
_DEFAULT_PERIOD_SECONDS: Final[int] = 30
_DEFAULT_ALLOWED_DRIFT_STEPS: Final[int] = 1
_TOTP_SECRET_BYTES: Final[int] = 20


def generate_totp_secret() -> str:
    """
    Generate a base32-encoded secret suitable for TOTP (RFC 6238).

    Notes:
    - No padding (Authenticator apps expect this format).
    - Uppercase base32.
    """

    raw = os.urandom(_TOTP_SECRET_BYTES)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def _b32decode_secret(secret_b32: str) -> bytes:
    raw = (secret_b32 or "").strip().replace(" ", "").upper()
    if not raw:
        raise ValueError("secret is empty")
    missing = (-len(raw)) % 8
    padded = raw + ("=" * missing)
    return base64.b32decode(padded, casefold=True)


def _hotp(key: bytes, counter: int, *, digits: int) -> str:
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    mod = 10**digits
    return str(code_int % mod).zfill(digits)


def generate_totp_code(
    secret_b32: str,
    *,
    at: datetime | None = None,
    digits: int = _DEFAULT_DIGITS,
    period_seconds: int = _DEFAULT_PERIOD_SECONDS,
) -> str:
    now = (at or datetime.now(tz=UTC)).astimezone(UTC)
    counter = int(now.timestamp()) // int(period_seconds)
    key = _b32decode_secret(secret_b32)
    return _hotp(key, counter, digits=int(digits))


def _normalize_totp_code(code: str) -> str:
    raw = (code or "").strip()
    if not raw:
        return ""
    digits_only = "".join(ch for ch in raw if ch.isdigit())
    return digits_only


@dataclass(frozen=True)
class TotpVerifyResult:
    ok: bool
    used_counter: int | None = None


def verify_totp_code(
    secret_b32: str,
    *,
    code: str,
    now: datetime | None = None,
    digits: int = _DEFAULT_DIGITS,
    period_seconds: int = _DEFAULT_PERIOD_SECONDS,
    allowed_drift_steps: int = _DEFAULT_ALLOWED_DRIFT_STEPS,
) -> TotpVerifyResult:
    """
    Verify a TOTP code.

    Security notes:
    - Uses constant-time comparison.
    - Allows small clock drift (default +/-1 step).
    """

    normalized = _normalize_totp_code(code)
    if not normalized:
        return TotpVerifyResult(ok=False)
    if len(normalized) != int(digits):
        return TotpVerifyResult(ok=False)

    now_utc = (now or datetime.now(tz=UTC)).astimezone(UTC)
    counter = int(now_utc.timestamp()) // int(period_seconds)

    key = _b32decode_secret(secret_b32)
    drift = int(allowed_drift_steps)
    for offset in range(-drift, drift + 1):
        expected = _hotp(key, counter + offset, digits=int(digits))
        if hmac.compare_digest(expected, normalized):
            return TotpVerifyResult(ok=True, used_counter=counter + offset)

    return TotpVerifyResult(ok=False)
