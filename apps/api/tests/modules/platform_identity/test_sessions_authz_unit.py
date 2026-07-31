from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Forbidden, Unauthorized
from src.modules.platform_identity.tokens import build_platform_access_token
from src.settings.env_models import PlatformAuthSettings


class _Session:
    def __init__(self, *, actor_id: UUID, now: datetime) -> None:
        self.id = uuid4()
        self.actor_user_id = actor_id
        self.operator_id: UUID | None = None
        self.session_identifier_hash = ""
        self.token_version = 1
        self.policy_revision = 4
        self.revoked_at = None
        self.recent_activity_at = now - timedelta(minutes=1)
        self.inactivity_expires_at = now + timedelta(minutes=10)
        self.absolute_expires_at = now + timedelta(hours=1)
        self.saved_fields: list[str] = []

    async def save(self, *, update_fields: list[str]) -> None:
        self.saved_fields = update_fields


class _Repository:
    def __init__(self, session: _Session, *, owner: bool, permission: bool) -> None:
        self.session = session
        self.owner = owner
        self.permission = permission
        self.operator = SimpleNamespace(id=uuid4())

    async def get_platform_session_by_identifier_hash(self, *, session_identifier_hash: str):
        if session_identifier_hash != self.session.session_identifier_hash:
            return None
        return self.session

    async def is_instance_owner(self, *, user_id: UUID) -> bool:
        return self.owner

    async def get_active_operator_by_user_id(self, *, user_id: UUID):
        return self.operator

    async def operator_has_permission(self, *, operator_id: UUID, permission_code: str, at: datetime) -> bool:
        return self.permission


def _settings() -> PlatformAuthSettings:
    return PlatformAuthSettings(
        jwt_secret="platform-secret-for-unit-tests-only",
        jwt_issuer="platform-issuer",
        jwt_audience="platform-api",
        device_session={
            "inactivity_ttl_seconds": 1800,
            "absolute_ttl_seconds": 28800,
            "policy_revision": 4,
        },
    )


@pytest.mark.asyncio
async def test_owner_session_is_revalidated_and_bypasses_role_permissions() -> None:
    from src.modules.platform_identity.sessions import (
        ensure_platform_permission,
        platform_session_identifier_hash,
        resolve_platform_session,
    )

    now = datetime.now(UTC)
    actor_id = uuid4()
    session = _Session(actor_id=actor_id, now=now)
    session.session_identifier_hash = platform_session_identifier_hash(session.id)
    repository = _Repository(session, owner=True, permission=False)
    settings = _settings()
    token, _ = build_platform_access_token(
        actor_id=actor_id,
        session_id=session.id,
        token_version=session.token_version,
        settings=settings,
    )

    principal = await resolve_platform_session(token=token, settings=settings, repository=repository, now=now)
    await ensure_platform_permission(
        permission_code="platform:access-sessions:revoke",
        principal=principal,
        repository=repository,
        now=now,
    )

    assert principal.actor_id == actor_id
    assert principal.is_instance_owner is True
    assert session.recent_activity_at == now
    assert session.saved_fields == ["recent_activity_at", "inactivity_expires_at"]


@pytest.mark.asyncio
async def test_rejects_stale_platform_session_policy_before_permission_check() -> None:
    from src.modules.platform_identity.sessions import platform_session_identifier_hash, resolve_platform_session

    now = datetime.now(UTC)
    actor_id = uuid4()
    session = _Session(actor_id=actor_id, now=now)
    session.policy_revision = 3
    session.session_identifier_hash = platform_session_identifier_hash(session.id)
    repository = _Repository(session, owner=False, permission=True)
    settings = _settings()
    token, _ = build_platform_access_token(
        actor_id=actor_id,
        session_id=session.id,
        token_version=session.token_version,
        settings=settings,
    )

    with pytest.raises(Unauthorized, match="PLATFORM_SESSION_POLICY_STALE"):
        await resolve_platform_session(token=token, settings=settings, repository=repository, now=now)


@pytest.mark.asyncio
async def test_rejects_an_operator_session_after_its_actor_becomes_instance_owner() -> None:
    from src.modules.platform_identity.sessions import platform_session_identifier_hash, resolve_platform_session

    now = datetime.now(UTC)
    actor_id = uuid4()
    session = _Session(actor_id=actor_id, now=now)
    session.session_identifier_hash = platform_session_identifier_hash(session.id)
    repository = _Repository(session, owner=True, permission=False)
    session.operator_id = repository.operator.id
    settings = _settings()
    token, _ = build_platform_access_token(
        actor_id=actor_id,
        session_id=session.id,
        token_version=session.token_version,
        settings=settings,
    )

    with pytest.raises(Unauthorized, match="PLATFORM_SESSION_ACCESS_REVOKED"):
        await resolve_platform_session(token=token, settings=settings, repository=repository, now=now)


@pytest.mark.asyncio
async def test_operator_requires_the_exact_current_role_permission() -> None:
    from src.modules.platform_identity.sessions import (
        ensure_platform_permission,
        platform_session_identifier_hash,
        resolve_platform_session,
    )

    now = datetime.now(UTC)
    actor_id = uuid4()
    session = _Session(actor_id=actor_id, now=now)
    session.session_identifier_hash = platform_session_identifier_hash(session.id)
    repository = _Repository(session, owner=False, permission=False)
    session.operator_id = repository.operator.id
    settings = _settings()
    token, _ = build_platform_access_token(
        actor_id=actor_id,
        session_id=session.id,
        token_version=session.token_version,
        settings=settings,
    )
    principal = await resolve_platform_session(token=token, settings=settings, repository=repository, now=now)

    with pytest.raises(Forbidden, match="PLATFORM_PERMISSION_DENIED"):
        await ensure_platform_permission(
            permission_code="platform:access-sessions:read",
            principal=principal,
            repository=repository,
            now=now,
        )
