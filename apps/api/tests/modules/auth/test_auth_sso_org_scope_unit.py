from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from starlette.requests import Request

from apps.api.common.protocols.auth_sso import AuthSSOProviderDecl
from apps.api.config import get_settings
from apps.api.modules.auth.schema import TokenPair
from apps.api.modules.auth.service import AuthService
from apps.api.modules.auth.sso.service import AuthSSOService
from apps.api.plugin.hooks import hookimpl
from apps.api.plugin.host import PluginHost
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.manifest import PluginManifest
from apps.api.plugin.types import PluginDescriptor, PluginStatus


class _FakeAuthService:
    async def issue_token_pair_for_user(self, user_id: UUID) -> TokenPair:
        raise RuntimeError("not used")


class _FakeSSOPlugin:
    @hookimpl
    def auth_sso_providers(self) -> list[Any]:  # type: ignore[override]
        class _Decl:
            plugin_id = "plugin-oauth-social"
            provider = "google"
            label = "Continue with Google"
            icon_key = "google"
            start_path = "/plugins/oauth/start/google"

            def is_enabled(self, *, plugin_config: dict[str, Any]) -> bool:
                section = plugin_config.get("google") if isinstance(plugin_config, dict) else None
                return bool(isinstance(section, dict) and section.get("enabled") and section.get("client_id"))

        return [cast(AuthSSOProviderDecl, _Decl())]


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


def _build_oauth_descriptor() -> PluginDescriptor:
    manifest = PluginManifest.model_validate({
        "plugin": {
            "id": "plugin-oauth-social",
            "slug": "oauth",
            "management_scope": "organization",
            "name": "OAuth Social Login",
            "description": "Provide social login",
            "author": "Test",
            "version": "0.1.0",
            "requires": ">=2026.01.18-dev",
            "entrypoint": "oauth_social.plugin:OAuthSocialPlugin",
        },
        "config_schema": {
            "sections": [
                {
                    "id": "google",
                    "title": "Google",
                    "fields": [
                        {"key": "enabled", "type": "bool", "default": False},
                        {"key": "client_id", "type": "str"},
                        {"key": "client_secret", "type": "str", "secret": True},
                    ],
                }
            ]
        },
    })
    return PluginDescriptor(manifest=manifest, path=Path("."), config={})


@pytest.mark.asyncio
async def test_auth_sso_list_providers_skips_org_plugin_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    host = PluginHost()
    host.register(_FakeSSOPlugin(), name="fake-sso")

    manager = PluginManager(settings, plugin_host=host)
    descriptor = _build_oauth_descriptor()
    manager.descriptors = {descriptor.plugin_id: descriptor}

    service = AuthSSOService(
        settings,
        manager=manager,
        valkey=None,
        auth_service=cast(AuthService, _FakeAuthService()),
    )

    async def _fake_org_id() -> UUID:
        return uuid4()

    async def _fake_record(*_args, **_kwargs):
        return SimpleNamespace(status=PluginStatus.STARTED)

    async def _fake_state(*_args, **_kwargs):
        return SimpleNamespace(enabled=False)

    async def _fake_config(*_args, **_kwargs):
        return {"google": {"enabled": True, "client_id": "id", "client_secret": "secret"}}

    monkeypatch.setattr("apps.api.modules.auth.sso.service.get_single_organization_id", _fake_org_id)
    monkeypatch.setattr("apps.api.modules.auth.sso.service.PluginRecord.get_or_none", _fake_record)
    monkeypatch.setattr("apps.api.modules.auth.sso.service.OrganizationPluginState.get_or_none", _fake_state)
    monkeypatch.setattr("apps.api.modules.auth.sso.service.get_org_plugin_settings_decrypted", _fake_config)

    request = _build_request("/api/v1/auth/sso/providers")
    items = await service.list_providers(request)
    assert items == []


@pytest.mark.asyncio
async def test_auth_sso_list_providers_returns_org_provider_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    host = PluginHost()
    host.register(_FakeSSOPlugin(), name="fake-sso")

    manager = PluginManager(settings, plugin_host=host)
    descriptor = _build_oauth_descriptor()
    manager.descriptors = {descriptor.plugin_id: descriptor}

    service = AuthSSOService(
        settings,
        manager=manager,
        valkey=None,
        auth_service=cast(AuthService, _FakeAuthService()),
    )

    async def _fake_org_id() -> UUID:
        return uuid4()

    async def _fake_record(*_args, **_kwargs):
        return SimpleNamespace(status=PluginStatus.STARTED)

    async def _fake_state(*_args, **_kwargs):
        return SimpleNamespace(enabled=True)

    async def _fake_config(*_args, **_kwargs):
        return {"google": {"enabled": True, "client_id": "id", "client_secret": "secret"}}

    monkeypatch.setattr("apps.api.modules.auth.sso.service.get_single_organization_id", _fake_org_id)
    monkeypatch.setattr("apps.api.modules.auth.sso.service.PluginRecord.get_or_none", _fake_record)
    monkeypatch.setattr("apps.api.modules.auth.sso.service.OrganizationPluginState.get_or_none", _fake_state)
    monkeypatch.setattr("apps.api.modules.auth.sso.service.get_org_plugin_settings_decrypted", _fake_config)

    request = _build_request("/api/v1/auth/sso/providers")
    items = await service.list_providers(request)

    assert len(items) == 1
    assert items[0]["provider"] == "google"
    assert "/api/v1/plugins/oauth/start/google" in str(items[0]["start_url"])
