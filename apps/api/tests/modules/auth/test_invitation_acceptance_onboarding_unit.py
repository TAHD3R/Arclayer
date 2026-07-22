from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import Settings
from src.models.organization.user import User
from src.modules.auth.invitations.acceptance import service as acceptance_module
from src.modules.auth.invitations.acceptance.service import AuthInvitationAcceptanceService
from src.modules.auth.onboarding.service import WorkspaceFirstOnboardingService
from src.modules.auth.schema import AcceptExistingInvitationRequest


class _Query:
    def __init__(self, *, first_result=None, all_result=None) -> None:
        self.first_result = first_result
        self.all_result = all_result or []

    def using_db(self, _connection: object) -> _Query:
        return self

    def select_for_update(self) -> _Query:
        return self

    async def first(self):
        return self.first_result

    async def all(self):
        return self.all_result


@pytest.mark.asyncio
async def test_existing_invitation_completes_pending_onboarding_in_acceptance_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = object()
    organization_id = uuid4()
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    inviter_user_id = uuid4()
    complete_pending_onboarding = AsyncMock(return_value=True)
    onboarding_service = cast(
        WorkspaceFirstOnboardingService,
        SimpleNamespace(complete_existing_workspace_if_pending=complete_pending_onboarding),
    )
    service = AuthInvitationAcceptanceService(
        Settings(app_env="test"),
        onboarding_service=onboarding_service,
    )

    @asynccontextmanager
    async def transaction():
        yield connection

    monkeypatch.setattr(service, "tx", transaction)
    monkeypatch.setattr(acceptance_module, "verify_invite_token", lambda *_args, **_kwargs: "invite-code")
    monkeypatch.setattr(acceptance_module, "is_workspace_invite_link_code", lambda _code: False)
    monkeypatch.setattr(acceptance_module, "is_workspace_email_invite_code", lambda _code: True)
    monkeypatch.setattr(acceptance_module, "is_workspace_guest_invite_code", lambda _code: False)

    email_invitation = SimpleNamespace(
        organization_id=organization_id,
        workspace_id=workspace_id,
        created_by_user_id=inviter_user_id,
        role_code=None,
        email="member@example.com",
        revoked_at=None,
        accepted_at=None,
        accepted_by_user_id=None,
        expires_at=None,
        save=AsyncMock(),
    )
    existing_organization_membership = SimpleNamespace(organization_id=organization_id)
    workspace_membership = SimpleNamespace(
        id=uuid4(),
        status=acceptance_module.WorkspaceMembershipStatus.ACTIVE,
    )
    user = cast(
        User,
        SimpleNamespace(
            id=user_id,
            email="member@example.com",
            display_name="Member",
            username="member01",
        ),
    )

    monkeypatch.setattr(
        acceptance_module.WorkspaceEmailInvite,
        "filter",
        lambda **_filters: _Query(first_result=email_invitation),
    )
    monkeypatch.setattr(
        acceptance_module.OrgMembership,
        "filter",
        lambda **_filters: _Query(first_result=existing_organization_membership),
    )
    monkeypatch.setattr(
        acceptance_module.SystemRole,
        "filter",
        lambda **_filters: _Query(all_result=[]),
    )
    monkeypatch.setattr(
        acceptance_module.WorkspaceMembership,
        "get_or_none",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        acceptance_module.WorkspaceMembership,
        "get_or_create",
        AsyncMock(return_value=(workspace_membership, True)),
    )
    monkeypatch.setattr(acceptance_module, "write_required_activity_event", AsyncMock())
    monkeypatch.setattr(acceptance_module, "create_notification_record", AsyncMock())
    monkeypatch.setattr(
        service.workspace_repo,
        "get_by_id_in_connection",
        AsyncMock(
            return_value=SimpleNamespace(
                organization_id=organization_id,
                is_active=True,
                archived_at=None,
            )
        ),
    )
    monkeypatch.setattr(
        service.project_repo,
        "get_first_project_by_workspace_id",
        AsyncMock(return_value=SimpleNamespace(id=project_id)),
    )
    ensure_admin_access = AsyncMock()

    result = await service.accept_existing_invitation(
        payload=AcceptExistingInvitationRequest(token="invite-token"),
        user=user,
        ensure_role_codes_have_admin_access=ensure_admin_access,
    )

    complete_pending_onboarding.assert_awaited_once_with(
        user_id=user_id,
        workspace_id=workspace_id,
        conn=connection,
    )
    ensure_admin_access.assert_awaited_once_with(
        workspace_id=workspace_id,
        role_codes=[],
        conn=connection,
    )
    assert result.workspace_id == workspace_id
    assert result.project_id == project_id
