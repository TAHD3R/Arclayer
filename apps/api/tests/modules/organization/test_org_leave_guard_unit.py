from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from apps.api.src.core.exceptions import Forbidden
from apps.api.src.modules.organization.settings.leave_guard import OrganizationLeaveGuard, OrgLeaveDataProvider


class FakeData(OrgLeaveDataProvider):
    def __init__(
        self,
        *,
        owned_ws_ids: list[UUID] | None = None,
        has_other_owner: bool = True,
    ) -> None:
        self._owned_ws_ids = owned_ws_ids or []
        self._has_other_owner = has_other_owner

    async def list_owned_workspace_ids_in_org(self, *, organization_id: UUID, user_id: UUID) -> list[UUID]:
        _ = organization_id, user_id
        return list(self._owned_ws_ids)

    async def workspace_has_other_owner(self, *, workspace_id: UUID, user_id: UUID) -> bool:
        _ = workspace_id, user_id
        return self._has_other_owner


@pytest.mark.asyncio
async def test_leave_org_blocked_when_last_workspace_owner() -> None:
    ws_id = uuid4()
    guard = OrganizationLeaveGuard(data=FakeData(owned_ws_ids=[ws_id], has_other_owner=False))

    with pytest.raises(Forbidden) as exc:
        await guard.ensure_can_leave(organization_id=uuid4(), user_id=uuid4())

    assert exc.value.error == "ORG_LEAVE_LAST_WORKSPACE_OWNER"
    assert exc.value.meta == {"workspace_id": str(ws_id)}


@pytest.mark.asyncio
async def test_leave_org_allowed_when_not_workspace_owner() -> None:
    guard = OrganizationLeaveGuard(data=FakeData(owned_ws_ids=[]))
    await guard.ensure_can_leave(organization_id=uuid4(), user_id=uuid4())


@pytest.mark.asyncio
async def test_leave_org_allowed_when_has_other_owner() -> None:
    guard = OrganizationLeaveGuard(data=FakeData(owned_ws_ids=[uuid4()], has_other_owner=True))
    await guard.ensure_can_leave(organization_id=uuid4(), user_id=uuid4())
