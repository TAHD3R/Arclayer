from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from starlette.requests import Request

from src.models.organization.user import User
from src.modules.auth.oauth.schema import OAuthLinkedIdentityListOut
from src.modules.auth.oauth.social.service import OAuthSocialService
from src.modules.auth.sso import router as sso_router


@dataclass(slots=True)
class _FakeUser:
    id: UUID


class _FakeValkey:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, int | None]] = []

    async def set(self, key: str, value: str, *, ex: int | None = None) -> bool:
        self.calls.append((key, value, ex))
        return True


class _IdentityQuery:
    def __init__(self, identities: list[object]) -> None:
        self._identities = identities

    async def all(self) -> list[object]:
        return self._identities


class _FakeOAuthService:
    def __init__(self, out: OAuthLinkedIdentityListOut) -> None:
        self.out = out
        self.unlinked: list[tuple[UUID, str]] = []

    async def list_identities_out(self, *, user_id: UUID) -> OAuthLinkedIdentityListOut:
        _ = user_id
        return self.out

    async def unlink_identity(self, *, user_id: UUID, provider: str) -> int:
        self.unlinked.append((user_id, provider))
        return 1


def _build_request(path: str = "/api/v1/auth/sso/link-state") -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
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
async def test_issue_link_state_returns_token_and_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    valkey = _FakeValkey()
    user = _FakeUser(id=uuid4())

    monkeypatch.setattr(sso_router, "get_valkey", lambda _request: valkey)
    monkeypatch.setattr(sso_router.secrets, "token_urlsafe", lambda _size: "fixed-link-state-token")

    out = await sso_router.issue_link_state(request=_build_request(), user=user)  # type: ignore[arg-type]

    assert out.error is None
    assert out.data is not None
    assert out.data.token == "fixed-link-state-token"
    assert out.data.expires_in == sso_router._SSO_LINK_STATE_EXPIRES_IN
    assert valkey.calls == [
        (
            f"{sso_router._SSO_LINK_STATE_KEY_PREFIX}fixed-link-state-token",
            str(user.id),
            sso_router._SSO_LINK_STATE_EXPIRES_IN,
        )
    ]


@pytest.mark.asyncio
async def test_list_my_oauth_identities_uses_service_output_without_placeholder_rows() -> None:
    user = _FakeUser(id=uuid4())
    service = _FakeOAuthService(out=OAuthLinkedIdentityListOut(identities=[]))

    out = await sso_router.list_my_oauth_identities(
        user=cast(User, user),
        service=cast(OAuthSocialService, service),
    )

    assert out.error is None
    assert out.data is not None
    assert out.data.identities == []


@pytest.mark.asyncio
async def test_unlink_last_signin_method_returns_last_signin_method_error(monkeypatch: pytest.MonkeyPatch) -> None:
    user = _FakeUser(id=uuid4())
    service = _FakeOAuthService(out=OAuthLinkedIdentityListOut(identities=[]))

    async def _no_password(*, user_id: UUID):
        _ = user_id
        return None

    monkeypatch.setattr(sso_router.UserCredential, "get_or_none", _no_password)
    monkeypatch.setattr(
        sso_router.OAuthIdentity,
        "filter",
        lambda **_kwargs: _IdentityQuery([SimpleNamespace(provider="google")]),
    )

    out = await sso_router.unlink_my_oauth_identity(  # type: ignore[arg-type]
        provider="google",
        user=cast(Any, user),
        service=cast(Any, service),
    )

    assert out.error == "LAST_SIGNIN_METHOD"
    assert service.unlinked == []


@pytest.mark.asyncio
async def test_unlink_identity_calls_service_when_password_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    user = _FakeUser(id=uuid4())
    service = _FakeOAuthService(out=OAuthLinkedIdentityListOut(identities=[]))

    async def _has_password(*, user_id: UUID):
        _ = user_id
        return SimpleNamespace(id=uuid4())

    monkeypatch.setattr(sso_router.UserCredential, "get_or_none", _has_password)
    monkeypatch.setattr(
        sso_router.OAuthIdentity,
        "filter",
        lambda **_kwargs: _IdentityQuery([SimpleNamespace(provider="google")]),
    )

    out = await sso_router.unlink_my_oauth_identity(  # type: ignore[arg-type]
        provider="google",
        user=cast(Any, user),
        service=cast(Any, service),
    )

    assert out.error is None
    assert service.unlinked == [(user.id, "google")]
