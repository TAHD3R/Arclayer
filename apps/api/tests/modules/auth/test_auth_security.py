from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest

from src.config import get_settings
from src.core.exceptions import Unauthorized
from src.modules.auth.tokens.service import (
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_REFRESH,
    build_access_token,
    build_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_and_verify(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    hashed = hash_password("secret", settings.auth)
    assert hashed
    assert verify_password("secret", hashed, settings.auth) is True
    assert verify_password("wrong", hashed, settings.auth) is False


def test_access_token_roundtrip(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    user_id = uuid4()
    token, ttl = build_access_token(user_id=user_id, token_version=1, settings=settings.auth)
    payload = decode_token(token, settings.auth)

    assert ttl > 0
    assert payload["sub"] == str(user_id)
    assert payload["typ"] == TOKEN_TYPE_ACCESS
    assert payload["ver"] == 1


def test_refresh_token_roundtrip(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    user_id = uuid4()
    token, jti, ttl = build_refresh_token(user_id=user_id, token_version=2, settings=settings.auth)
    payload = decode_token(token, settings.auth)

    assert ttl > 0
    assert payload["sub"] == str(user_id)
    assert payload["typ"] == TOKEN_TYPE_REFRESH
    assert payload["jti"] == jti
    assert payload["ver"] == 2


def test_decode_expired_token(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    now = datetime.now(UTC)
    payload = {
        "sub": str(uuid4()),
        "typ": TOKEN_TYPE_ACCESS,
        "ver": 0,
        "iss": settings.auth.jwt_issuer,
        "aud": settings.auth.jwt_audience,
        "iat": int(now.timestamp()) - 10,
        "exp": int((now - timedelta(seconds=1)).timestamp()),
    }
    token = jwt.encode(payload, settings.auth.jwt_secret.get_secret_value(), algorithm=settings.auth.jwt_algorithm)

    with pytest.raises(Unauthorized) as exc:
        decode_token(token, settings.auth)

    assert exc.value.error == "TOKEN_EXPIRED"


def test_decode_invalid_token(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    token, _ = build_access_token(user_id=uuid4(), token_version=0, settings=settings.auth)
    bad_token = token + "tamper"

    with pytest.raises(Unauthorized) as exc:
        decode_token(bad_token, settings.auth)

    assert exc.value.error == "TOKEN_INVALID"
