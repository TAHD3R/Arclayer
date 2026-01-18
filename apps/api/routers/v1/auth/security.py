from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt

from apps.api.common.utils.passwords import hash_password as _hash_password
from apps.api.common.utils.passwords import verify_password as _verify_password
from apps.api.config import AuthSettings
from apps.api.core.exceptions import ServiceUnavailable, Unauthorized

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


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
    return _hash_password(password)


def verify_password(password: str, password_hash: str, settings: AuthSettings) -> bool:
    return _verify_password(password, password_hash)
