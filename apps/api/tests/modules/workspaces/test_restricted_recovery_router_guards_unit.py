from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import APIError, Forbidden
from src.modules.workspaces import service as workspace_service_module
from src.modules.workspaces.extensions import router as extensions_router
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from src.modules.workspaces.rbac import router as rbac_router
from src.modules.workspaces.rbac.schema import RoleCreateFromTemplateRequest
from src.modules.workspaces.service import WorkspaceService
from src.modules.workspaces.settings import router as settings_router
from src.modules.workspaces.settings.integrations.webhooks import router as webhooks_router
from src.modules.workspaces.settings.integrations.webhooks.schema import WebhookSubscriptionCreateIn
from src.modules.workspaces.settings.schema import WorkspaceAssignRoleToMembersRequest
from src.modules.workspaces.team import router as team_router
from src.modules.workspaces.team.schema import WorkspaceTeamMemberRoleSetRequest

pytestmark = pytest.mark.unit


class _RejectingPolicy:
    async def authorize(self, *, workspace_id: UUID, effects: set[object]) -> None:
        _ = workspace_id, effects
        raise APIError(error="WORKSPACE_PAYMENT_RESTRICTED", status_code=402)


def _context() -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=uuid4(),
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
    )


@pytest.mark.asyncio
async def test_team_role_and_member_enable_changes_stop_before_service_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(team_router, "build_restricted_recovery_command_policy", _RejectingPolicy)
    ctx = _context()

    with pytest.raises(APIError, match="WORKSPACE_PAYMENT_RESTRICTED") as role_error:
        await team_router.set_member_roles(
            membership_id=uuid4(),
            payload=WorkspaceTeamMemberRoleSetRequest(role_codes=["editor"]),
            ctx=ctx,
            user_id=uuid4(),
            settings=SimpleNamespace(),
        )
    with pytest.raises(APIError, match="WORKSPACE_PAYMENT_RESTRICTED"):
        await team_router.enable_member(
            membership_id=uuid4(),
            ctx=ctx,
            user_id=uuid4(),
            settings=SimpleNamespace(),
        )

    assert role_error.value.status_code == 402


@pytest.mark.asyncio
async def test_rbac_grant_stops_before_role_management_service_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rbac_router, "build_restricted_recovery_command_policy", _RejectingPolicy)

    with pytest.raises(APIError, match="WORKSPACE_PAYMENT_RESTRICTED") as error:
        await rbac_router.create_role(
            body=RoleCreateFromTemplateRequest(code="editor", name="Editor"),
            ctx=_context(),
            user_id=uuid4(),
            service=SimpleNamespace(),
        )

    assert error.value.status_code == 402


@pytest.mark.asyncio
async def test_workspace_connector_and_bulk_role_assignment_stop_before_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ctx = _context()
    policy = _RejectingPolicy
    monkeypatch.setattr(settings_router, "build_restricted_recovery_command_policy", policy)
    monkeypatch.setattr(webhooks_router, "build_restricted_recovery_command_policy", policy)
    monkeypatch.setattr(extensions_router, "build_restricted_recovery_command_policy", policy)

    with pytest.raises(APIError, match="WORKSPACE_PAYMENT_RESTRICTED"):
        await settings_router.assign_workspace_role_to_regular_members(
            payload=WorkspaceAssignRoleToMembersRequest(role_code="editor", confirm_name="Workspace"),
            ctx=ctx,
            user_id=uuid4(),
            settings=SimpleNamespace(),
        )
    with pytest.raises(APIError, match="WORKSPACE_PAYMENT_RESTRICTED"):
        await webhooks_router.create_webhook_subscription(
            payload=WebhookSubscriptionCreateIn(
                capability_id="content.events",
                event="project.content.updated",
                endpoint_url="https://example.test/webhooks",
            ),
            ctx=ctx,
            service=SimpleNamespace(),
        )
    with pytest.raises(APIError, match="WORKSPACE_PAYMENT_RESTRICTED"):
        await extensions_router.activate_workspace_extension(
            extension_name="example-extension",
            request=SimpleNamespace(),
            ctx=ctx,
        )


@pytest.mark.asyncio
async def test_lifecycle_owner_helper_rejects_non_owner_before_commercial_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    owner_user_id = uuid4()
    monkeypatch.setattr(
        workspace_service_module.Workspace,
        "get_or_none",
        AsyncMock(return_value=SimpleNamespace(owner_user_id=owner_user_id)),
    )
    service = WorkspaceService(get_settings())

    with pytest.raises(Forbidden) as error:
        await service.require_workspace_lifecycle_owner(workspace_id=workspace_id, user_id=uuid4())

    assert error.value.error == "WORKSPACE_OWNER_REQUIRED"
    assert error.value.status_code == 403
