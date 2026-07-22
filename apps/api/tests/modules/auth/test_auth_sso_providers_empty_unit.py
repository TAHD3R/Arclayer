from __future__ import annotations

from uuid import UUID

import pytest
from starlette.requests import Request

from src.config import get_settings
from src.core.registries import ConnectorRegistry
from src.modules.auth.schema import TokenPair
from src.modules.auth.sessions.request_context import AuthRequestContext
from src.modules.auth.sso.service import AuthSSOService
from tests.modules.auth.oauth_connector_test_context import build_official_oauth_connector_registry


class _FakeLoginService:
    # `AuthSSOService.list_providers()` doesn't touch auth service, but keep shape compatible.
    async def issue_after_upstream_auth(
        self,
        *,
        user_id: UUID,
        request_context: AuthRequestContext | None = None,
        auth_method: str = "sso",
    ) -> TokenPair:
        _ = request_context, auth_method
        raise RuntimeError("not used")


def _build_request(path: str) -> Request:
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
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_auth_sso_list_providers_returns_empty_when_core_oauth_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()

    async def _fake_core_settings(*_args, **_kwargs):
        return {}

    monkeypatch.setattr("src.modules.auth.sso.service.get_core_settings_value_cached", _fake_core_settings)

    service = AuthSSOService(
        settings,
        valkey=None,
        login_service=_FakeLoginService(),
        connector_registry=ConnectorRegistry(),
    )

    request = _build_request("/api/v1/auth/sso/providers")
    items = await service.list_providers(request, redirect="/")
    assert items == []


@pytest.mark.asyncio
async def test_auth_sso_list_providers_returns_configured_builtin_providers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()

    async def _fake_core_settings(*_args, **_kwargs):
        return {
            "oauth_google": {"enabled": True, "client_id": "gid", "client_secret": "gsecret"},
            "oauth_github": {"enabled": True, "client_id": "hid", "client_secret": "hsecret"},
            "oauth_microsoft": {"enabled": True, "client_id": "mid", "client_secret": "msecret"},
            "oauth_discord": {"enabled": True, "client_id": "did", "client_secret": "dsecret"},
        }

    monkeypatch.setattr("src.modules.auth.sso.service.get_core_settings_value_cached", _fake_core_settings)

    service = AuthSSOService(
        settings,
        valkey=None,
        login_service=_FakeLoginService(),
        connector_registry=await build_official_oauth_connector_registry(),
    )

    request = _build_request("/api/v1/auth/sso/providers")
    items = await service.list_providers(request, redirect="/w/project")

    assert [item["provider"] for item in items] == ["google", "github", "microsoft", "discord"]
    assert [item["icon_key"] for item in items] == ["google", "github", "microsoft", "discord"]
    assert items[2]["label"] == "Continue with Microsoft"
    assert items[2]["start_url"] == ("http://testserver/api/v1/auth/sso/start/microsoft?redirect=%2Fw%2Fproject")
    assert items[3]["start_url"] == ("http://testserver/api/v1/auth/sso/start/discord?redirect=%2Fw%2Fproject")
