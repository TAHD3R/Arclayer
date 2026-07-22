from __future__ import annotations

from pathlib import Path
from typing import cast
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.analytics.audit_event import AuditEvent
from src.models.auth.oauth_identity import OAuthIdentity
from src.models.organization.user import User
from src.modules.auth.oauth.social import service as oauth_social_service_module
from src.modules.auth.oauth.social.schema import OAuthStatePayload
from src.modules.auth.oauth.social.service import OAuthSocialService
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.platform.cache.valkey import ValkeyClientLike
from src.settings.crypto import ensure_master_key
from tests.modules.auth.oauth_connector_test_context import build_official_oauth_connector_registry

pytestmark = pytest.mark.integration


def _set_test_env(monkeypatch, *, base_dir: Path) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "0123456789abcdef0123456789abcdef")
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(base_dir / "master.key"))
    get_settings.cache_clear()


async def _create_user(*, password: str) -> User:
    settings = get_settings()
    user_repo = UserRepository()
    return await user_repo.create_user(
        username=f"user_{uuid4().hex}",
        email=f"user_{uuid4().hex[:8]}@example.com",
        display_name="SSO User",
        password_hash=hash_password(password, settings.auth),
    )


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


class _FakeValkey:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def key(self, *parts: str) -> str:
        return ":".join(parts)

    async def set(self, key: str, value: str, *, ex: int | None = None) -> bool:
        _ = ex
        self.values[key] = value
        return True

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def delete(self, *keys: str) -> int:
        removed = 0
        for key in keys:
            if key in self.values:
                removed += 1
                self.values.pop(key, None)
        return removed

    async def expire(self, key: str, seconds: int) -> bool:
        _ = key, seconds
        return True

    async def ttl(self, key: str) -> int:
        _ = key
        return 0

    async def get_json(self, key: str) -> object | None:
        _ = key
        return None

    async def set_json(
        self,
        key: str,
        data: object,
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

    async def smembers(self, key: str):
        _ = key
        return set()


async def _prepare_link_service(monkeypatch, *, base_dir: Path) -> tuple[OAuthSocialService, Request, User, str]:
    _set_test_env(monkeypatch, base_dir=base_dir)
    settings = get_settings()
    ensure_master_key(Path(settings.security.master_key_path))
    user = await _create_user(password="pass1234")
    valkey = cast(ValkeyClientLike, _FakeValkey())
    service = OAuthSocialService(
        settings,
        valkey=valkey,
        connector_registry=await build_official_oauth_connector_registry(),
    )
    request = _build_callback_request("google")
    payload_json = OAuthStatePayload(
        provider="google",
        redirect="/w/account",
        code_verifier="verifier",
        link_user_id=str(user.id),
    ).model_dump_json()

    async def _fake_load_config(_section_ids: tuple[str, ...]) -> dict[str, object]:
        return {
            "oauth_google": {"enabled": True, "client_id": "cid", "client_secret": "secret"},
            "oauth_provisioning": {"auto_provision_enabled": True, "auto_accept_email_invites": False},
        }

    async def _fake_getdel(*_args, **_kwargs) -> str:
        return payload_json

    async def _fake_frontend_base_url() -> str:
        return ""

    async def _fake_issue_exchange_code(*_args, **_kwargs) -> str:
        return "exchange-123"

    monkeypatch.setattr(service, "_load_core_oauth_config", _fake_load_config)
    monkeypatch.setattr(service, "_resolve_frontend_base_url", _fake_frontend_base_url)
    monkeypatch.setattr("src.modules.auth.oauth.social.service._valkey_getdel_best_effort", _fake_getdel)
    monkeypatch.setattr(
        "src.modules.auth.oauth.social.service.httpx.AsyncClient", lambda *args, **kwargs: _FakeGoogleClient()
    )
    monkeypatch.setattr("src.modules.auth.oauth.social.service.issue_exchange_code", _fake_issue_exchange_code)
    return service, request, user, payload_json


async def _login(client: AsyncClient, *, email: str, password: str) -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json().get("data") or {}


def _access_token(tokens: dict) -> str:
    return str(tokens.get("accessToken") or tokens.get("access_token") or "")


@pytest.mark.asyncio
async def test_auth_sso_link_activity_readback_and_rollback(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path: Path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    service, request, user, payload_json = await _prepare_link_service(monkeypatch, base_dir=tmp_path)
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=True)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            tokens = await _login(client, email=user.email, password="pass1234")
            auth_headers = {"Authorization": f"Bearer {_access_token(tokens)}"}
            link_state_res = await client.post("/api/v1/auth/sso/link-state", headers=auth_headers)
            assert link_state_res.status_code == 200, link_state_res.text
            link_state = str((link_state_res.json().get("data") or {}).get("token") or "")
            assert link_state
            provider = "google"
            callback_response = await service.callback(
                request, provider=provider, code="oauth-code", state="oauth-state"
            )
            assert callback_response.status_code == 302
            location = callback_response.headers.get("location") or ""
            parsed = urlparse(location)
            query = parse_qs(parsed.query)
            assert query.get("linked_provider") == [provider]

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        linked_event = await AuditEvent.filter(event_name="auth.sso.linked", actor_user_id=user.id).first()
        assert linked_event is not None
        assert linked_event.entity_type == "auth_sso_identity"
        assert linked_event.entity_id == user.id
        assert linked_event.properties is not None
        assert linked_event.properties.get("provider") == "google"
        assert linked_event.properties.get("subject_hint") is not None
        assert linked_event.properties.get("email") is None

        identity = await OAuthIdentity.get(provider="google", subject="google-sub")
        assert identity.user_id == user.id

        event_count_before = await AuditEvent.filter(event_name="auth.sso.linked", actor_user_id=user.id).count()
        original_write_required_activity_event = oauth_social_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.sso.linked":
                raise RuntimeError("forced activity write failure: auth.sso.linked")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.oauth.social.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await service.callback(request, provider="google", code="oauth-code", state="oauth-state")
        monkeypatch.setattr(
            "src.modules.auth.oauth.social.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert (
            await AuditEvent.filter(event_name="auth.sso.linked", actor_user_id=user.id).count() == event_count_before
        )
        assert await OAuthIdentity.filter(provider="google", subject="google-sub").count() == 1
        assert await OAuthIdentity.filter(user_id=user.id, provider="google").count() == 1


@pytest.mark.asyncio
async def test_auth_sso_unlink_activity_readback_and_rollback(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path: Path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    _set_test_env(monkeypatch, base_dir=tmp_path)
    settings = get_settings()
    ensure_master_key(Path(settings.security.master_key_path))
    user = await _create_user(password="pass1234")
    await OAuthIdentity.create(provider="google", subject="google-sub", user_id=user.id, email="new-user@example.com")

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=True)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            tokens = await _login(client, email=user.email, password="pass1234")
            auth_headers = {"Authorization": f"Bearer {_access_token(tokens)}"}

            unlink = await client.delete("/api/v1/auth/sso/me/identities/google", headers=auth_headers)
            assert unlink.status_code == 200, unlink.text

            event = await AuditEvent.filter(event_name="auth.sso.unlinked", actor_user_id=user.id).first()
            assert event is not None
            assert event.entity_type == "auth_sso_identity"
            assert event.entity_id == user.id
            assert event.properties is not None
            assert event.properties.get("provider") == "google"
            assert event.properties.get("subject_hint") is not None

            original_write_required_activity_event = oauth_social_service_module.write_required_activity_event

            async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
                if payload.event_name == "auth.sso.unlinked":
                    raise RuntimeError("forced activity write failure: auth.sso.unlinked")
                return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

            monkeypatch.setattr(
                "src.modules.auth.oauth.social.service.write_required_activity_event",
                _failing_write_required_activity_event,
            )
            await OAuthIdentity.create(
                provider="google", subject="google-sub", user_id=user.id, email="new-user@example.com"
            )
            with pytest.raises(RuntimeError, match="forced activity write failure"):
                await client.delete("/api/v1/auth/sso/me/identities/google", headers=auth_headers)
            monkeypatch.setattr(
                "src.modules.auth.oauth.social.service.write_required_activity_event",
                original_write_required_activity_event,
            )

            assert await AuditEvent.filter(event_name="auth.sso.unlinked", actor_user_id=user.id).count() == 1
            assert await OAuthIdentity.filter(user_id=user.id, provider="google").count() == 1
