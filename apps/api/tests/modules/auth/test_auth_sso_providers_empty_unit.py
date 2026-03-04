from __future__ import annotations

from typing import cast
from uuid import UUID

import pytest
from starlette.requests import Request

from apps.api.src.config import get_settings
from apps.api.src.modules.auth.schema import TokenPair
from apps.api.src.modules.auth.service import AuthService
from apps.api.src.modules.auth.sso.service import AuthSSOService


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
async def test_auth_sso_list_providers_returns_empty_when_core_oauth_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()

    async def _fake_core_settings(*_args, **_kwargs):
        return {}

    monkeypatch.setattr("apps.api.src.modules.auth.sso.service.get_core_settings_value_cached", _fake_core_settings)

    service = AuthSSOService(settings, valkey=None, auth_service=cast(AuthService, _FakeAuthService()))

    request = _build_request("/api/v1/auth/sso/providers")
    items = await service.list_providers(request, redirect="/")
    assert items == []
