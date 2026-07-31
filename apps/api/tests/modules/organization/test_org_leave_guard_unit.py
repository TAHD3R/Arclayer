from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Forbidden
from src.modules.organization.settings.leave_guard import OrganizationLeaveGuard, OrgLeaveDataProvider


class FakeData(OrgLeaveDataProvider):
    def __init__(
        self,
        *,
        owned_ws_ids: list[UUID] | None = None,
    ) -> None:
        self._owned_ws_ids = owned_ws_ids or []

    async def list_owned_workspace_ids_in_org(self, *, organization_id: UUID, user_id: UUID) -> list[UUID]:
        _ = organization_id, user_id
        return list(self._owned_ws_ids)

    def transfer_workspaces(self) -> None:
        self._owned_ws_ids = []


@pytest.mark.asyncio
async def test_leave_org_requires_workspace_ownership_transfer() -> None:
    ws_id = uuid4()
    data = FakeData(owned_ws_ids=[ws_id])
    guard = OrganizationLeaveGuard(data=data)

    with pytest.raises(Forbidden) as exc:
        await guard.ensure_can_leave(organization_id=uuid4(), user_id=uuid4())

    assert exc.value.error == "ORG_LEAVE_OWNED_WORKSPACE_REQUIRES_TRANSFER"
    assert exc.value.meta == {"workspace_id": str(ws_id)}

    data.transfer_workspaces()
    await guard.ensure_can_leave(organization_id=uuid4(), user_id=uuid4())


@pytest.mark.asyncio
async def test_leave_org_allowed_when_not_workspace_owner() -> None:
    guard = OrganizationLeaveGuard(data=FakeData(owned_ws_ids=[]))
    await guard.ensure_can_leave(organization_id=uuid4(), user_id=uuid4())
