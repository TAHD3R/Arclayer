from __future__ import annotations

from typing import cast
from uuid import UUID

import pytest
from starlette.requests import Request

from apps.api.src.config import get_settings
from apps.api.src.modules.auth.schema import TokenPair
from apps.api.src.modules.auth.service import AuthService
from apps.api.src.modules.auth.sso.service import AuthSSOService
from apps.api.src.plugin.host import PluginHost
from apps.api.src.plugin.manager import PluginManager


class _FakeAuthService:
    # `AuthSSOService.list_providers()` doesn't touch auth service, but keep shape compatible.
    async def issue_token_pair_for_user(self, user_id: UUID) -> TokenPair:
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
async def test_auth_sso_list_providers_returns_empty_without_plugins_started() -> None:
    # Disable plugin discovery to keep this a pure unit test and to simulate "plugin uninstalled".
    settings = get_settings()
    settings = settings.model_copy(update={"plugin": settings.plugin.model_copy(update={"enabled": False})})

    host = PluginHost()  # contains only "core" hook impls
    manager = PluginManager(settings, plugin_host=host)
    service = AuthSSOService(
        settings,
        manager=manager,
        valkey=None,
        auth_service=cast(AuthService, _FakeAuthService()),
    )

    request = _build_request("/api/v1/auth/sso/providers")
    items = await service.list_providers(request, redirect="/")
    assert items == []
