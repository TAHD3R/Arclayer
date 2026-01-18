from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt

from apps.api.config import AuthSettings
from apps.api.core.exceptions import ServiceUnavailable, Unauthorized

TOKEN_TYPE_ACCESS = "access"  # noqa: S105
TOKEN_TYPE_REFRESH = "refresh"  # noqa: S105
PASSWORD_SCHEME = "pbkdf2_sha256"  # noqa: S105


def _now() -> datetime:
    return datetime.now(UTC)


def _get_secret(settings: AuthSettings) -> str:
    secret = settings.jwt_secret.get_secret_value()
    if not secret:
        raise ServiceUnavailable(message="JWT 密钥未配置", error="JWT_SECRET_MISSING")
    return secret


def _encode(payload: dict[str, Any], settings: AuthSettings) -> str:
    secret = _get_secret(settings)
    return jwt.encode(payload, secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: AuthSettings) -> dict[str, Any]:
    secret = _get_secret(settings)
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized(message="Token 已过期", error="TOKEN_EXPIRED") from exc
    except jwt.InvalidTokenError as exc:
        raise Unauthorized(message="Token 无效", error="TOKEN_INVALID") from exc


def build_access_token(*, user_id: UUID, token_version: int, settings: AuthSettings) -> tuple[str, int]:
    ttl = max(settings.access_token_ttl_seconds, 1)
    now = _now()
    payload = {
        "sub": str(user_id),
        "typ": TOKEN_TYPE_ACCESS,
        "ver": token_version,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    return _encode(payload, settings), ttl


def build_refresh_token(*, user_id: UUID, token_version: int, settings: AuthSettings) -> tuple[str, str, int]:
    ttl = max(settings.refresh_token_ttl_seconds, 1)
    now = _now()
    jti = uuid4().hex
    payload = {
        "sub": str(user_id),
        "typ": TOKEN_TYPE_REFRESH,
        "ver": token_version,
        "jti": jti,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    return _encode(payload, settings), jti, ttl


def hash_password(password: str, settings: AuthSettings) -> str:
    iterations = max(settings.password_hash_iterations, 1)
    salt_bytes = max(settings.password_hash_salt_bytes, 8)
    salt = secrets.token_bytes(salt_bytes)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    dk_b64 = base64.b64encode(dk).decode("ascii")
    return f"{PASSWORD_SCHEME}${iterations}${salt_b64}${dk_b64}"


def verify_password(password: str, password_hash: str, settings: AuthSettings) -> bool:
    try:
        scheme, iterations_raw, salt_b64, dk_b64 = password_hash.split("$", 3)
        if scheme != PASSWORD_SCHEME:
            return False
        iterations = int(iterations_raw)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
    except (ValueError, TypeError):
        return False

    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(dk, expected)
