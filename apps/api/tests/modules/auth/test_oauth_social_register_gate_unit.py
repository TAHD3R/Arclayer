from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from starlette.requests import Request

from src.config import get_settings
from src.infra.cache.valkey import ValkeyClientLike
from src.modules.auth.oauth.social.schema import OAuthStatePayload
from src.modules.auth.oauth.social.service import OAuthSocialService


class _FakeValkey(ValkeyClientLike):
    def key(self, *parts: str) -> str:
        return ":".join(parts)

    async def get(self, key: str) -> str | None:
        _ = key
        return None

    async def set(
        self,
        key: str,
        value: str,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        _ = key, value, ex, nx, xx
        return True

    async def delete(self, *keys: str) -> int:
        _ = keys
        return 0

    async def expire(self, key: str, seconds: int) -> bool:
        _ = key, seconds
        return True

    async def ttl(self, key: str) -> int:
        _ = key
        return 0

    async def get_json(self, key: str) -> Any:
        _ = key
        return None

    async def set_json(
        self,
        key: str,
        data: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        _ = key, data, ex, nx, xx
        return True

    async def sadd(self, key: str, *members: str) -> int:
        _ = key, members
        return 0

    async def srem(self, key: str, *members: str) -> int:
        _ = key, members
        return 0

    async def smembers(self, key: str) -> set[str]:
        _ = key
        return set()


def _build_callback_request(provider: str) -> Request:
    app = FastAPI()

    @app.get("/auth/sso/callback/{provider}", name="auth_sso_oauth_callback")
    async def _noop_callback(provider: str):
        _ = provider
        return {"ok": True}

    path = f"/auth/sso/callback/{provider}"
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 123),
        "server": ("testserver", 80),
        "app": app,
        "router": app.router,
    }
    return Request(scope)


class _FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self._payload


class _FakeGoogleClient:
    async def __aenter__(self) -> _FakeGoogleClient:
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        _ = exc_type, exc, tb
        return None

    async def post(self, *_args, **_kwargs) -> _FakeResponse:
        return _FakeResponse({"access_token": "google-token"})

    async def get(self, *_args, **_kwargs) -> _FakeResponse:
        return _FakeResponse({
            "sub": "google-sub",
            "email": "new-user@example.com",
            "email_verified": True,
            "name": "New User",
            "picture": "https://example.com/avatar.png",
        })


@pytest.mark.asyncio
async def test_oauth_social_blocks_new_user_auto_provision_when_public_register_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    old_allow = settings.auth.allow_public_register
    settings.auth.allow_public_register = False

    service = OAuthSocialService(settings, valkey=_FakeValkey())
    request = _build_callback_request("google")

    payload_json = OAuthStatePayload(
        provider="google",
        redirect="/w/new",
        code_verifier="verifier",
    ).model_dump_json()

    async def _fake_load_config() -> dict[str, object]:
        return {
            "oauth_google": {"enabled": True, "client_id": "cid", "client_secret": "secret"},
            "oauth_provisioning": {"auto_provision_enabled": True, "auto_accept_email_invites": False},
        }

    create_user_called = {"count": 0}

    async def _fake_get_identity(*, provider: str, subject: str):
        _ = provider, subject
        return None

    async def _fake_get_user_by_email(*, email: str):
        _ = email
        return None

    async def _fake_create_user(*, email: str, display_name: str | None, avatar_url: str | None):
        _ = email, display_name, avatar_url
        create_user_called["count"] += 1
        return SimpleNamespace(id=uuid4())

    async def _fake_frontend_base_url() -> str:
        return ""

    async def _fake_getdel(*_args, **_kwargs) -> str:
        return payload_json

    monkeypatch.setattr(service, "_load_core_oauth_config", _fake_load_config)
    monkeypatch.setattr(service, "_resolve_frontend_base_url", _fake_frontend_base_url)
    monkeypatch.setattr("src.modules.auth.oauth.social.service._valkey_getdel_best_effort", _fake_getdel)
    monkeypatch.setattr(
        "src.modules.auth.oauth.social.service.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeGoogleClient(),
    )
    monkeypatch.setattr(service.repo, "get_identity", _fake_get_identity)
    monkeypatch.setattr(service.repo, "get_user_by_email", _fake_get_user_by_email)
    monkeypatch.setattr(service.repo, "create_user", _fake_create_user)

    try:
        response = await service.callback(request, provider="google", code="oauth-code", state="oauth-state")
    finally:
        settings.auth.allow_public_register = old_allow

    assert create_user_called["count"] == 0
    location = response.headers.get("location") or ""
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert query.get("oauth_error") == ["provisioning_disabled"]


@pytest.mark.asyncio
async def test_oauth_social_allows_existing_user_signin_when_public_register_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    old_allow = settings.auth.allow_public_register
    settings.auth.allow_public_register = False

    service = OAuthSocialService(settings, valkey=_FakeValkey())
    request = _build_callback_request("google")

    payload_json = OAuthStatePayload(
        provider="google",
        redirect="/w/existing",
        code_verifier="verifier",
    ).model_dump_json()

    existing_user_id = uuid4()
    created_identity: dict[str, UUID | None] = {"user_id": None}

    async def _fake_load_config() -> dict[str, object]:
        return {
            "oauth_google": {"enabled": True, "client_id": "cid", "client_secret": "secret"},
            "oauth_provisioning": {"auto_provision_enabled": False, "auto_accept_email_invites": False},
        }

    async def _fake_get_identity(*, provider: str, subject: str):
        _ = provider, subject
        return None

    async def _fake_get_user_by_email(*, email: str):
        _ = email
        return SimpleNamespace(id=existing_user_id)

    async def _fake_create_identity(*, provider: str, subject: str, user_id: UUID, email: str | None):
        _ = provider, subject, email
        created_identity["user_id"] = user_id
        return SimpleNamespace()

    async def _fake_issue_exchange_code(*_args, **_kwargs) -> str:
        return "exchange-123"

    async def _fake_frontend_base_url() -> str:
        return ""

    async def _fake_getdel(*_args, **_kwargs) -> str:
        return payload_json

    monkeypatch.setattr(service, "_load_core_oauth_config", _fake_load_config)
    monkeypatch.setattr(service, "_resolve_frontend_base_url", _fake_frontend_base_url)
    monkeypatch.setattr("src.modules.auth.oauth.social.service._valkey_getdel_best_effort", _fake_getdel)
    monkeypatch.setattr(
        "src.modules.auth.oauth.social.service.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeGoogleClient(),
    )
    monkeypatch.setattr("src.modules.auth.oauth.social.service.issue_exchange_code", _fake_issue_exchange_code)
    monkeypatch.setattr(service.repo, "get_identity", _fake_get_identity)
    monkeypatch.setattr(service.repo, "get_user_by_email", _fake_get_user_by_email)
    monkeypatch.setattr(service.repo, "create_identity", _fake_create_identity)

    try:
        response = await service.callback(request, provider="google", code="oauth-code", state="oauth-state")
    finally:
        settings.auth.allow_public_register = old_allow

    assert created_identity["user_id"] == existing_user_id
    location = response.headers.get("location") or ""
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert query.get("oauth_code") == ["exchange-123"]


@pytest.mark.asyncio
async def test_oauth_social_blocks_new_user_when_auto_provision_disabled_even_if_public_register_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    old_allow = settings.auth.allow_public_register
    settings.auth.allow_public_register = True

    service = OAuthSocialService(settings, valkey=_FakeValkey())
    request = _build_callback_request("google")

    payload_json = OAuthStatePayload(
        provider="google",
        redirect="/w/new",
        code_verifier="verifier",
    ).model_dump_json()

    async def _fake_load_config() -> dict[str, object]:
        return {
            "oauth_google": {"enabled": True, "client_id": "cid", "client_secret": "secret"},
            "oauth_provisioning": {"auto_provision_enabled": False, "auto_accept_email_invites": False},
        }

    create_user_called = {"count": 0}

    async def _fake_get_identity(*, provider: str, subject: str):
        _ = provider, subject
        return None

    async def _fake_get_user_by_email(*, email: str):
        _ = email
        return None

    async def _fake_create_user(*, email: str, display_name: str | None, avatar_url: str | None):
        _ = email, display_name, avatar_url
        create_user_called["count"] += 1
        return SimpleNamespace(id=uuid4())

    async def _fake_frontend_base_url() -> str:
        return ""

    async def _fake_getdel(*_args, **_kwargs) -> str:
        return payload_json

    monkeypatch.setattr(service, "_load_core_oauth_config", _fake_load_config)
    monkeypatch.setattr(service, "_resolve_frontend_base_url", _fake_frontend_base_url)
    monkeypatch.setattr("src.modules.auth.oauth.social.service._valkey_getdel_best_effort", _fake_getdel)
    monkeypatch.setattr(
        "src.modules.auth.oauth.social.service.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeGoogleClient(),
    )
    monkeypatch.setattr(service.repo, "get_identity", _fake_get_identity)
    monkeypatch.setattr(service.repo, "get_user_by_email", _fake_get_user_by_email)
    monkeypatch.setattr(service.repo, "create_user", _fake_create_user)

    try:
        response = await service.callback(request, provider="google", code="oauth-code", state="oauth-state")
    finally:
        settings.auth.allow_public_register = old_allow

    assert create_user_called["count"] == 0
    location = response.headers.get("location") or ""
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert query.get("oauth_error") == ["provisioning_disabled"]


@pytest.mark.asyncio
async def test_oauth_social_auto_provisions_new_user_when_all_gates_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    old_allow = settings.auth.allow_public_register
    settings.auth.allow_public_register = True

    service = OAuthSocialService(settings, valkey=_FakeValkey())
    request = _build_callback_request("google")

    payload_json = OAuthStatePayload(
        provider="google",
        redirect="/w/new",
        code_verifier="verifier",
    ).model_dump_json()

    created_user_id = uuid4()
    created_identity: dict[str, UUID | None] = {"user_id": None}
    create_user_called = {"count": 0}

    async def _fake_load_config() -> dict[str, object]:
        return {
            "oauth_google": {"enabled": True, "client_id": "cid", "client_secret": "secret"},
            "oauth_provisioning": {"auto_provision_enabled": True, "auto_accept_email_invites": False},
        }

    async def _fake_get_identity(*, provider: str, subject: str):
        _ = provider, subject
        return None

    async def _fake_get_user_by_email(*, email: str):
        _ = email
        return None

    async def _fake_create_user(*, email: str, display_name: str | None, avatar_url: str | None):
        _ = email, display_name, avatar_url
        create_user_called["count"] += 1
        return SimpleNamespace(id=created_user_id)

    async def _fake_create_identity(*, provider: str, subject: str, user_id: UUID, email: str | None):
        _ = provider, subject, email
        created_identity["user_id"] = user_id
        return SimpleNamespace()

    async def _fake_issue_exchange_code(*_args, **_kwargs) -> str:
        return "exchange-allow"

    async def _fake_frontend_base_url() -> str:
        return ""

    async def _fake_getdel(*_args, **_kwargs) -> str:
        return payload_json

    monkeypatch.setattr(service, "_load_core_oauth_config", _fake_load_config)
    monkeypatch.setattr(service, "_resolve_frontend_base_url", _fake_frontend_base_url)
    monkeypatch.setattr("src.modules.auth.oauth.social.service._valkey_getdel_best_effort", _fake_getdel)
    monkeypatch.setattr(
        "src.modules.auth.oauth.social.service.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeGoogleClient(),
    )
    monkeypatch.setattr("src.modules.auth.oauth.social.service.issue_exchange_code", _fake_issue_exchange_code)
    monkeypatch.setattr(service.repo, "get_identity", _fake_get_identity)
    monkeypatch.setattr(service.repo, "get_user_by_email", _fake_get_user_by_email)
    monkeypatch.setattr(service.repo, "create_user", _fake_create_user)
    monkeypatch.setattr(service.repo, "create_identity", _fake_create_identity)

    try:
        response = await service.callback(request, provider="google", code="oauth-code", state="oauth-state")
    finally:
        settings.auth.allow_public_register = old_allow

    assert create_user_called["count"] == 1
    assert created_identity["user_id"] == created_user_id
    location = response.headers.get("location") or ""
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert query.get("oauth_code") == ["exchange-allow"]
