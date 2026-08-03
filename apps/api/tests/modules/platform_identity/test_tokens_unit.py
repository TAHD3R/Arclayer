from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from pydantic import SecretStr

from src.config import Settings
from src.core.exceptions import Unauthorized
from src.settings.env_models import PlatformAuthSettings


def _settings() -> PlatformAuthSettings:
    return PlatformAuthSettings(
        jwt_secret=SecretStr("platform-test-secret-at-least-32-bytes"),
        jwt_issuer="arclayer-platform-test",
        jwt_audience="arclayer-platform-api",
    )


def test_platform_auth_defaults_keep_short_bearers_and_one_day_device_sessions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for variable in (
        "PLATFORM_AUTH__ACCESS_TOKEN_TTL_SECONDS",
        "PLATFORM_AUTH__DEVICE_SESSION__INACTIVITY_TTL_SECONDS",
        "PLATFORM_AUTH__DEVICE_SESSION__ABSOLUTE_TTL_SECONDS",
        "PLATFORM_AUTH__DEVICE_SESSION__POLICY_REVISION",
    ):
        monkeypatch.delenv(variable, raising=False)

    settings = PlatformAuthSettings()

    assert settings.access_token_ttl_seconds == 28_800
    assert settings.device_session.inactivity_ttl_seconds == 28_800
    assert settings.device_session.absolute_ttl_seconds == 28_800
    assert settings.device_session.policy_revision == 3
    assert settings.device_session.policy_revision == 2


def test_platform_auth_settings_use_a_dedicated_environment_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "product-secret")
    monkeypatch.setenv("AUTH__JWT_ISSUER", "product-issuer")
    monkeypatch.setenv("PLATFORM_AUTH__JWT_SECRET", "platform-secret")
    monkeypatch.setenv("PLATFORM_AUTH__JWT_ISSUER", "platform-issuer")
    monkeypatch.setenv("PLATFORM_AUTH__JWT_AUDIENCE", "platform-api")
    monkeypatch.setenv("PLATFORM_AUTH__COOKIE__NAME", "platform_session")
    monkeypatch.setenv("PLATFORM_AUTH__DEVICE_SESSION__INACTIVITY_TTL_SECONDS", "1800")
    monkeypatch.setenv("PLATFORM_AUTH__DEVICE_SESSION__ABSOLUTE_TTL_SECONDS", "28800")
    monkeypatch.setenv("PLATFORM_AUTH__DEVICE_SESSION__POLICY_REVISION", "4")

    settings = Settings()

    assert settings.platform_auth.jwt_secret.get_secret_value() == "platform-secret"
    assert settings.platform_auth.jwt_issuer == "platform-issuer"
    assert settings.platform_auth.jwt_audience == "platform-api"
    assert settings.platform_auth.cookie.name == "platform_session"
    assert settings.platform_auth.device_session.inactivity_ttl_seconds == 1800
    assert settings.platform_auth.device_session.absolute_ttl_seconds == 28800
    assert settings.platform_auth.device_session.policy_revision == 4


def test_platform_access_token_binds_actor_session_and_token_version() -> None:
    from src.modules.platform_identity.tokens import (
        PLATFORM_TOKEN_TYPE_ACCESS,
        build_platform_access_token,
        decode_platform_access_token,
    )

    settings = _settings()
    actor_id = uuid4()
    session_id = uuid4()

    token, ttl = build_platform_access_token(
        actor_id=actor_id,
        session_id=session_id,
        token_version=7,
        settings=settings,
    )
    payload = decode_platform_access_token(token, settings)

    assert ttl == settings.access_token_ttl_seconds
    assert payload["sub"] == str(actor_id)
    assert payload["sid"] == str(session_id)
    assert payload["ver"] == 7
    assert payload["typ"] == PLATFORM_TOKEN_TYPE_ACCESS
    assert "permissions" not in payload
    assert "permission_snapshot" not in payload


def test_platform_decoder_rejects_a_product_token_even_with_matching_signature() -> None:
    from src.modules.platform_identity.tokens import decode_platform_access_token

    settings = _settings()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "sid": str(uuid4()),
            "ver": 1,
            "typ": "access",
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=1)).timestamp()),
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(Unauthorized) as exc:
        decode_platform_access_token(token, settings)

    assert exc.value.error == "PLATFORM_TOKEN_TYPE_INVALID"


def test_platform_decoder_rejects_product_audience() -> None:
    from src.modules.platform_identity.tokens import decode_platform_access_token

    settings = _settings()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "sid": str(uuid4()),
            "ver": 1,
            "typ": "platform_access",
            "iss": settings.jwt_issuer,
            "aud": "arclayer",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=1)).timestamp()),
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(Unauthorized) as exc:
        decode_platform_access_token(token, settings)

    assert exc.value.error == "PLATFORM_TOKEN_AUDIENCE_INVALID"


def test_platform_decoder_exposes_missing_session_claim() -> None:
    from src.modules.platform_identity.tokens import decode_platform_access_token

    settings = _settings()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "ver": 1,
            "typ": "platform_access",
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=1)).timestamp()),
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(Unauthorized) as exc:
        decode_platform_access_token(token, settings)

    assert exc.value.error == "PLATFORM_TOKEN_CLAIMS_INVALID"


def test_platform_decoder_exposes_expiry_as_a_platform_error() -> None:
    from src.modules.platform_identity.tokens import decode_platform_access_token

    settings = _settings()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "sid": str(uuid4()),
            "ver": 1,
            "typ": "platform_access",
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": int((now - timedelta(seconds=10)).timestamp()),
            "exp": int((now - timedelta(seconds=1)).timestamp()),
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(Unauthorized) as exc:
        decode_platform_access_token(token, settings)

    assert exc.value.error == "PLATFORM_TOKEN_EXPIRED"
