from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from src.core.exceptions import ServiceUnavailable, Unauthorized
from src.core.i18n import t
from src.settings.env_models import PlatformAuthSettings

PLATFORM_TOKEN_TYPE_ACCESS = "platform_access"
_FORBIDDEN_CLAIMS = frozenset({"permissions", "permission_snapshot"})


def _now() -> datetime:
    return datetime.now(UTC)


def _unauthorized(error: str) -> Unauthorized:
    return Unauthorized(message=error, error=error)


def _get_secret(settings: PlatformAuthSettings) -> str:
    secret = settings.jwt_secret.get_secret_value()
    if not secret:
        raise ServiceUnavailable(
            message=t("errors", "PLATFORM_JWT_SECRET_MISSING"),
            error="PLATFORM_JWT_SECRET_MISSING",
        )
    return secret


def _validate_claims(payload: dict[str, object]) -> dict[str, object]:
    if payload.get("typ") != PLATFORM_TOKEN_TYPE_ACCESS:
        raise _unauthorized("PLATFORM_TOKEN_TYPE_INVALID")
    if not isinstance(payload.get("sub"), str) or not payload["sub"]:
        raise _unauthorized("PLATFORM_TOKEN_CLAIMS_INVALID")
    if not isinstance(payload.get("sid"), str) or not payload["sid"]:
        raise _unauthorized("PLATFORM_TOKEN_CLAIMS_INVALID")
    if not isinstance(payload.get("ver"), int) or isinstance(payload["ver"], bool):
        raise _unauthorized("PLATFORM_TOKEN_CLAIMS_INVALID")
    if _FORBIDDEN_CLAIMS.intersection(payload):
        raise _unauthorized("PLATFORM_TOKEN_CLAIMS_INVALID")
    return payload


def build_platform_access_token(
    *,
    actor_id: UUID,
    session_id: UUID,
    token_version: int,
    settings: PlatformAuthSettings,
) -> tuple[str, int]:
    ttl = settings.access_token_ttl_seconds
    now = _now()
    payload: dict[str, object] = {
        "sub": str(actor_id),
        "sid": str(session_id),
        "ver": token_version,
        "typ": PLATFORM_TOKEN_TYPE_ACCESS,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    return jwt.encode(payload, _get_secret(settings), algorithm=settings.jwt_algorithm), ttl


def decode_platform_access_token(token: str, settings: PlatformAuthSettings) -> dict[str, object]:
    try:
        payload = jwt.decode(
            token,
            _get_secret(settings),
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["exp", "iat", "sub", "sid", "ver", "typ"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("PLATFORM_TOKEN_EXPIRED") from exc
    except jwt.InvalidAudienceError as exc:
        raise _unauthorized("PLATFORM_TOKEN_AUDIENCE_INVALID") from exc
    except jwt.InvalidIssuerError as exc:
        raise _unauthorized("PLATFORM_TOKEN_ISSUER_INVALID") from exc
    except jwt.MissingRequiredClaimError as exc:
        raise _unauthorized("PLATFORM_TOKEN_CLAIMS_INVALID") from exc
    except jwt.InvalidTokenError as exc:
        raise _unauthorized("PLATFORM_TOKEN_INVALID") from exc
    return _validate_claims(payload)
