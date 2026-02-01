from __future__ import annotations

import base64
import hmac
import secrets
from hashlib import sha256

from apps.api.config import Settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t


def _get_invite_signing_secret(settings: Settings) -> bytes:
    """
    Return a stable secret for signing invite tokens.

    We intentionally reuse AUTH JWT secret to avoid introducing a new env var surface area
    during the v2 refactor. If the secret is empty, signed tokens become forgeable, so we
    fail closed.
    """

    secret = (settings.auth.jwt_secret.get_secret_value() or "").strip()
    if not secret:
        raise ServiceUnavailable(
            message=t("errors", "SERVICE_UNAVAILABLE", default="服务不可用"),
            error="INVITE_SIGNING_SECRET_MISSING",
        )
    return secret.encode("utf-8")


def generate_invite_code(*, prefix: str) -> str:
    """
    Generate a non-secret invite code.

    Notes:
    - The code itself is NOT sufficient to accept an invite; acceptance requires a signed token.
    - Prefixes are used to avoid cross-table collisions and to make token debugging safer.
    """

    p = (prefix or "").strip()
    if not p:
        p = "i"
    # 24 bytes -> 32 chars (base64url without padding).
    raw = secrets.token_urlsafe(24).replace("-", "").replace("_", "")
    return f"{p}_{raw}"


def _sign_code(settings: Settings, *, code: str) -> bytes:
    secret = _get_invite_signing_secret(settings)
    msg = (code or "").encode("utf-8")
    return hmac.new(secret, msg, sha256).digest()


def build_invite_token(settings: Settings, *, code: str) -> str:
    """
    Build a signed token string that can be verified later without storing any secrets.

    Format: <code>.<sig>
    - code: stored in DB (non-secret)
    - sig: base64url(HMAC(secret, code))
    """

    c = (code or "").strip()
    if not c:
        raise ValueError("invite code is required")
    sig = _sign_code(settings, code=c)
    sig_b64 = base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    return f"{c}.{sig_b64}"


def verify_invite_token(settings: Settings, *, token: str) -> str | None:
    """
    Verify a signed token and return the invite code if valid.
    """

    raw = (token or "").strip()
    if not raw or "." not in raw:
        return None
    code, sig_b64 = raw.split(".", 1)
    if not code or not sig_b64:
        return None

    # Restore padding for base64 decoding.
    padding = "=" * (-len(sig_b64) % 4)
    try:
        sig = base64.urlsafe_b64decode((sig_b64 + padding).encode("ascii"))
    except Exception:
        return None

    expected = _sign_code(settings, code=code)
    if not hmac.compare_digest(sig, expected):
        return None
    return code
