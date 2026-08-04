from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from httpx import ASGITransport, AsyncClient

from src.config import Settings, get_settings
from src.core.exceptions import Forbidden
from src.core.registry import create_app, create_platform_app
from src.models.platform_identity.operations import PlatformVerificationAssurance
from src.modules.auth.http.service import get_current_access_payload
from src.modules.auth.tokens.service import build_access_token, build_refresh_token
from src.modules.platform_identity.http import (
    get_platform_identity_repository,
    require_platform_permission,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_identity.sessions import issue_platform_session, platform_session_identifier_hash
from src.modules.platform_identity.tokens import build_platform_access_token

_BOUNDARY_PERMISSION = PlatformPermissionCode.MONITORING_REQUESTS_READ
_PLATFORM_PROBE_PATH = "/platform-api/v1/_test/current-authority"
_PRODUCT_PROBE_PATH = "/api/v1/_test/current-session"


class _PlatformSessionRecord:
    def __init__(self, *, actor_id: UUID, operator_id: UUID, now: datetime) -> None:
        self.id = uuid4()
        self.actor_user_id = actor_id
        self.operator_id = operator_id
        self.session_identifier_hash = platform_session_identifier_hash(self.id)
        self.token_version = 1
        self.policy_revision = 1
        self.revoked_at: datetime | None = None
        self.recent_activity_at = now
        self.inactivity_expires_at = now + timedelta(minutes=30)
        self.absolute_expires_at = now + timedelta(hours=8)

    async def save(self, *, update_fields: list[str]) -> None:
        assert update_fields == ["recent_activity_at", "inactivity_expires_at"]


class _MutablePlatformAuthority:
    def __init__(self, *, actor_id: UUID, now: datetime) -> None:
        self.actor_id = actor_id
        self.operator = SimpleNamespace(id=uuid4())
        self.session = _PlatformSessionRecord(actor_id=actor_id, operator_id=self.operator.id, now=now)
        self.operator_active = True
        self.user_status = "active"
        self.current_permissions = {_BOUNDARY_PERMISSION}
        # Legacy tenant authority is deliberately present but has no Platform meaning.
        self.is_workspace_owner = True
        self.is_organization_owner = True

    async def get_platform_session_by_identifier_hash(self, *, session_identifier_hash: str):
        if self.session.revoked_at is not None:
            return None
        if session_identifier_hash != self.session.session_identifier_hash:
            return None
        return self.session

    async def get_user_by_id(self, *, user_id: UUID):
        assert user_id == self.actor_id
        return SimpleNamespace(status=self.user_status)

    async def is_instance_owner(self, *, user_id: UUID) -> bool:
        assert user_id == self.actor_id
        return False

    async def get_active_operator_by_user_id(self, *, user_id: UUID):
        assert user_id == self.actor_id
        return self.operator if self.operator_active else None

    async def operator_has_permission(self, *, operator_id: UUID, permission_code: str, at: datetime) -> bool:
        assert operator_id == self.operator.id
        assert at.tzinfo is not None
        return permission_code in self.current_permissions


def _configure_distinct_auth_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("AUTH__JWT_SECRET", "product-secret-for-boundary-tests")
    monkeypatch.setenv("AUTH__JWT_ISSUER", "arclayer-product-test")
    monkeypatch.setenv("AUTH__JWT_AUDIENCE", "arclayer-product-api-test")
    monkeypatch.setenv("AUTH__COOKIE__ENABLED", "1")
    monkeypatch.setenv("AUTH__COOKIE__NAME", "product_refresh")
    monkeypatch.setenv("PLATFORM_AUTH__JWT_SECRET", "platform-secret-for-boundary-tests")
    monkeypatch.setenv("PLATFORM_AUTH__JWT_ISSUER", "arclayer-platform-test")
    monkeypatch.setenv("PLATFORM_AUTH__JWT_AUDIENCE", "arclayer-platform-api-test")
    monkeypatch.setenv("PLATFORM_AUTH__DEVICE_SESSION__POLICY_REVISION", "1")
    get_settings.cache_clear()
    return get_settings()


def _add_platform_probe(app) -> None:
    async def current_platform_authority(
        principal: PlatformSessionPrincipal = require_platform_permission(_BOUNDARY_PERMISSION),
    ) -> dict[str, str]:
        return {"actorId": str(principal.actor_id)}

    app.add_api_route(_PLATFORM_PROBE_PATH, current_platform_authority, methods=["GET"])


def _add_product_probe(app) -> None:
    async def current_product_session(
        payload: dict[str, object] = Depends(get_current_access_payload),
    ) -> dict[str, str]:
        return {"actorId": str(payload["sub"])}

    app.add_api_route(_PRODUCT_PROBE_PATH, current_product_session, methods=["GET"])


def _platform_token(*, authority: _MutablePlatformAuthority, settings: Settings) -> str:
    token, _ = build_platform_access_token(
        actor_id=authority.actor_id,
        session_id=authority.session.id,
        token_version=authority.session.token_version,
        settings=settings.platform_auth,
    )
    return token


@pytest.mark.asyncio
async def test_platform_api_rejects_product_access_refresh_and_cookie_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_distinct_auth_settings(monkeypatch)
    actor_id = uuid4()
    access_token, _ = build_access_token(user_id=actor_id, token_version=1, settings=settings.auth)
    refresh_token, _, _ = build_refresh_token(user_id=actor_id, token_version=1, settings=settings.auth)
    app = create_platform_app()
    _add_platform_probe(app)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://platform.test") as client:
        access_response = await client.get(
            _PLATFORM_PROBE_PATH,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        refresh_response = await client.get(
            _PLATFORM_PROBE_PATH,
            headers={"Authorization": f"Bearer {refresh_token}"},
        )
        client.cookies.set(settings.auth.cookie.name, refresh_token)
        cookie_response = await client.get(_PLATFORM_PROBE_PATH)

    assert access_response.status_code == 401
    assert refresh_response.status_code == 401
    assert cookie_response.status_code == 401
    assert access_response.json()["error"] == "PLATFORM_TOKEN_INVALID"
    assert refresh_response.json()["error"] == "PLATFORM_TOKEN_INVALID"
    assert cookie_response.json()["error"] == "PLATFORM_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_product_api_rejects_a_platform_access_token(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _configure_distinct_auth_settings(monkeypatch)
    authority = _MutablePlatformAuthority(actor_id=uuid4(), now=datetime.now(UTC))
    platform_token = _platform_token(authority=authority, settings=settings)
    app = create_app()
    _add_product_probe(app)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://product.test") as client:
        response = await client.get(
            _PRODUCT_PROBE_PATH,
            headers={"Authorization": f"Bearer {platform_token}"},
        )

    assert response.status_code == 401
    assert response.json()["error"] == "TOKEN_INVALID"


@pytest.mark.asyncio
async def test_workspace_and_organization_authority_do_not_grant_platform_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_distinct_auth_settings(monkeypatch)
    authority = _MutablePlatformAuthority(actor_id=uuid4(), now=datetime.now(UTC))
    authority.operator_active = False
    with pytest.raises(Forbidden, match="PLATFORM_ACCESS_REQUIRED"):
        await issue_platform_session(
            actor_id=authority.actor_id,
            assurance=PlatformVerificationAssurance.LOCAL_MFA,
            device_label="tenant-authority-only",
            settings=settings.platform_auth,
            repository=authority,
        )

    assert authority.is_workspace_owner is True
    assert authority.is_organization_owner is True


@pytest.mark.asyncio
async def test_operator_offboarding_denies_the_next_platform_request(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _configure_distinct_auth_settings(monkeypatch)
    authority = _MutablePlatformAuthority(actor_id=uuid4(), now=datetime.now(UTC))
    app = create_platform_app()
    _add_platform_probe(app)
    app.dependency_overrides[get_platform_identity_repository] = lambda: authority
    headers = {"Authorization": f"Bearer {_platform_token(authority=authority, settings=settings)}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://platform.test") as client:
        before = await client.get(_PLATFORM_PROBE_PATH, headers=headers)
        authority.operator_active = False
        after = await client.get(_PLATFORM_PROBE_PATH, headers=headers)

    assert before.status_code == 200
    assert after.status_code == 401
    assert after.json()["error"] == "PLATFORM_SESSION_ACCESS_REVOKED"


@pytest.mark.asyncio
async def test_current_role_revision_removal_denies_the_next_platform_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_distinct_auth_settings(monkeypatch)
    authority = _MutablePlatformAuthority(actor_id=uuid4(), now=datetime.now(UTC))
    app = create_platform_app()
    _add_platform_probe(app)
    app.dependency_overrides[get_platform_identity_repository] = lambda: authority
    headers = {"Authorization": f"Bearer {_platform_token(authority=authority, settings=settings)}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://platform.test") as client:
        before = await client.get(_PLATFORM_PROBE_PATH, headers=headers)
        authority.current_permissions.clear()
        after = await client.get(_PLATFORM_PROBE_PATH, headers=headers)

    assert before.status_code == 200
    assert after.status_code == 403
    assert after.json()["error"] == "PLATFORM_PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_platform_session_revocation_denies_next_platform_request_without_ending_product_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_distinct_auth_settings(monkeypatch)
    authority = _MutablePlatformAuthority(actor_id=uuid4(), now=datetime.now(UTC))
    platform_app = create_platform_app()
    _add_platform_probe(platform_app)
    platform_app.dependency_overrides[get_platform_identity_repository] = lambda: authority
    product_app = create_app()
    _add_product_probe(product_app)
    platform_headers = {"Authorization": f"Bearer {_platform_token(authority=authority, settings=settings)}"}
    product_token, _ = build_access_token(user_id=authority.actor_id, token_version=1, settings=settings.auth)
    product_headers = {"Authorization": f"Bearer {product_token}"}

    async with (
        AsyncClient(transport=ASGITransport(app=platform_app), base_url="http://platform.test") as platform_client,
        AsyncClient(transport=ASGITransport(app=product_app), base_url="http://product.test") as product_client,
    ):
        platform_before = await platform_client.get(_PLATFORM_PROBE_PATH, headers=platform_headers)
        product_before = await product_client.get(_PRODUCT_PROBE_PATH, headers=product_headers)
        authority.session.revoked_at = datetime.now(UTC)
        platform_after = await platform_client.get(_PLATFORM_PROBE_PATH, headers=platform_headers)
        product_after = await product_client.get(_PRODUCT_PROBE_PATH, headers=product_headers)

    assert platform_before.status_code == 200
    assert product_before.status_code == 200
    assert platform_after.status_code == 401
    assert platform_after.json()["error"] == "PLATFORM_SESSION_INVALID"
    assert product_after.status_code == 200
    assert product_after.json()["actorId"] == str(authority.actor_id)
