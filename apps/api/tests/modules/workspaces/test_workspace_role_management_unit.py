from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from src.common.constants.rbac import WORKSPACE_COMMERCE_MANAGE
from src.core.exceptions import BadRequest, Conflict
from src.models.commerce.billing import CommercialAccessState
from src.modules.workspaces.authz.role_management import (
    WorkspaceRoleManagementAvailability,
    require_workspace_role_management,
)
from src.modules.workspaces.rbac.service import WorkspaceRBACService


class _AvailabilityReader:
    def __init__(self, availability: WorkspaceRoleManagementAvailability) -> None:
        self._availability = availability

    async def get_availability(self, **_kwargs: object) -> WorkspaceRoleManagementAvailability:
        return self._availability


@pytest.mark.asyncio
async def test_excluded_role_management_rejects_mutations_before_role_validation() -> None:
    workspace_id = uuid4()
    reader = _AvailabilityReader(
        WorkspaceRoleManagementAvailability(
            workspace_id=workspace_id,
            plan_revision_id=uuid4(),
            commercial_access_state=CommercialAccessState.NORMAL,
            included=False,
            reason="entitlement_excluded",
        )
    )
    repo = SimpleNamespace()
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, repo),
        role_management_reader=reader,
    )

    with pytest.raises(Conflict) as exc_info:
        await service.create_custom_role(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            actor_user_id=uuid4(),
            code="custom-role",
            name="Custom role",
            description=None,
            template_role_code="missing-template",
        )

    assert exc_info.value.error == "WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED"


@pytest.mark.asyncio
async def test_missing_commercial_binding_is_explicit_failure() -> None:
    workspace_id = uuid4()
    reader = _AvailabilityReader(
        WorkspaceRoleManagementAvailability(
            workspace_id=workspace_id,
            plan_revision_id=None,
            commercial_access_state=None,
            included=False,
            reason="subscription_missing",
        )
    )

    with pytest.raises(Conflict) as exc_info:
        await require_workspace_role_management(workspace_id=workspace_id, reader=reader)

    assert exc_info.value.error == "WORKSPACE_COMMERCIAL_UNINITIALIZED"
    assert exc_info.value.meta == {
        "workspace_id": str(workspace_id),
        "plan_revision_id": None,
        "entitlement": "workspace.roles.manage",
        "reason": "subscription_missing",
    }


@pytest.mark.asyncio
async def test_payment_restricted_rejects_new_role_or_permission_mutations() -> None:
    workspace_id = uuid4()
    reader = _AvailabilityReader(
        WorkspaceRoleManagementAvailability(
            workspace_id=workspace_id,
            plan_revision_id=uuid4(),
            commercial_access_state=CommercialAccessState.PAYMENT_RESTRICTED,
            included=True,
        )
    )

    with pytest.raises(Conflict) as exc_info:
        await require_workspace_role_management(workspace_id=workspace_id, reader=reader)

    assert exc_info.value.error == "WORKSPACE_PAYMENT_RESTRICTED"


@pytest.mark.asyncio
async def test_commerce_permission_delegation_requires_workspace_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id = uuid4()
    reader = _AvailabilityReader(
        WorkspaceRoleManagementAvailability(
            workspace_id=workspace_id,
            plan_revision_id=uuid4(),
            commercial_access_state=CommercialAccessState.NORMAL,
            included=True,
        )
    )
    repo = SimpleNamespace(get_permission_by_code=pytest.fail)
    service = WorkspaceRBACService(
        settings=cast(Any, SimpleNamespace()),
        repo=cast(Any, repo),
        role_management_reader=reader,
    )

    async def deny_owner(**_kwargs: object) -> None:
        raise BadRequest("denied", error="WORKSPACE_COMMERCE_MANAGE_OWNER_REQUIRED")

    monkeypatch.setattr(service, "_require_commerce_permission_owner", deny_owner)

    with pytest.raises(BadRequest) as exc_info:
        await service.set_permission_custom_roles(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            actor_user_id=uuid4(),
            permission_code=WORKSPACE_COMMERCE_MANAGE,
            role_codes=[],
        )

    assert exc_info.value.error == "WORKSPACE_COMMERCE_MANAGE_OWNER_REQUIRED"
