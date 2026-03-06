from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from apps.api.src.config import get_settings
from apps.api.src.core.http.pagination import PageParams
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.user import UserStatus
from apps.api.src.modules.organization.members.service import OrganizationMemberService


class _FakeOrgMemberRepo:
    def __init__(self, rows: list[SimpleNamespace]) -> None:
        self._rows = rows

    async def list_memberships(self, *, organization_id):
        _ = organization_id
        return list(self._rows)

    async def list_workspace_memberships_for_user_ids(self, *, organization_id, user_ids):
        _ = organization_id, user_ids
        return []


@pytest.mark.asyncio
async def test_list_members_can_filter_by_role_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationMemberService(settings)

    joined_at = datetime.now(UTC)
    owner_user = SimpleNamespace(
        id=uuid4(),
        username="owner_user",
        email="owner@example.com",
        display_name="Owner",
        avatar_url=None,
        status=UserStatus.ACTIVE,
        last_login_at=None,
    )
    member_user = SimpleNamespace(
        id=uuid4(),
        username="member_user",
        email="member@example.com",
        display_name="Member",
        avatar_url=None,
        status=UserStatus.ACTIVE,
        last_login_at=None,
    )

    rows = [
        SimpleNamespace(
            id=uuid4(),
            role=OrgRole.MEMBER,
            role_code="ops_manager",
            status="active",
            user=owner_user,
            created_at=joined_at,
        ),
        SimpleNamespace(
            id=uuid4(),
            role=OrgRole.MEMBER,
            role_code="member",
            status="active",
            user=member_user,
            created_at=joined_at,
        ),
    ]

    service.repo = _FakeOrgMemberRepo(rows)  # type: ignore[assignment]

    async def _allow(*, organization_id, actor_membership, permission_code, error_code="ORG_PERMISSION_DENIED"):
        _ = organization_id, actor_membership, permission_code, error_code
        return None

    service._ensure_permission = _allow  # type: ignore[assignment]

    page = await service.list_members(
        organization_id=uuid4(),
        actor_membership=cast(OrgMembership, SimpleNamespace()),
        params=PageParams(page=1, size=20),
        q=None,
        ordering=None,
        role=None,
        role_code="ops_manager",
        membership_status=None,
        user_status=None,
        has_workspace=None,
        joined_from=None,
        joined_to=None,
        last_login_from=None,
        last_login_to=None,
    )

    assert page.total == 1
    assert len(page.items) == 1
    assert page.items[0].role_code == "ops_manager"


@pytest.mark.asyncio
async def test_list_members_includes_workspace_icon_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationMemberService(settings)

    joined_at = datetime.now(UTC)
    user = SimpleNamespace(
        id=uuid4(),
        username="owner_user",
        email="owner@example.com",
        display_name="Owner",
        avatar_url=None,
        status=UserStatus.ACTIVE,
        last_login_at=None,
    )
    row = SimpleNamespace(
        id=uuid4(),
        role=OrgRole.MEMBER,
        role_code="member",
        status="active",
        user=user,
        created_at=joined_at,
    )

    workspace = SimpleNamespace(
        id=uuid4(),
        name="Design System",
        slug="design-system",
        icon_url="/assets/workspace-icon.png",
    )
    workspace_membership = SimpleNamespace(
        user_id=user.id,
        status="active",
        created_at=joined_at,
        workspace=workspace,
        membership_roles=[],
    )

    service.repo = _FakeOrgMemberRepo([row])  # type: ignore[assignment]

    async def _list_workspace_memberships(*, organization_id, user_ids):
        _ = organization_id, user_ids
        return [workspace_membership]

    async def _allow(*, organization_id, actor_membership, permission_code, error_code="ORG_PERMISSION_DENIED"):
        _ = organization_id, actor_membership, permission_code, error_code
        return None

    service.repo.list_workspace_memberships_for_user_ids = _list_workspace_memberships  # type: ignore[method-assign]
    service._ensure_permission = _allow  # type: ignore[assignment]

    page = await service.list_members(
        organization_id=uuid4(),
        actor_membership=cast(OrgMembership, SimpleNamespace()),
        params=PageParams(page=1, size=20),
        q=None,
        ordering=None,
        role=None,
        role_code=None,
        membership_status=None,
        user_status=None,
        has_workspace=None,
        joined_from=None,
        joined_to=None,
        last_login_from=None,
        last_login_to=None,
    )

    assert page.total == 1
    assert page.items[0].workspaces[0].icon_url == "/assets/workspace-icon.png"
