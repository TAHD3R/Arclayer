from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Forbidden
from src.modules.auth.account_deletion.guard import AccountDeletionDataProvider, AccountDeletionGuard


class FakeData(AccountDeletionDataProvider):
    def __init__(
        self,
        *,
        owned_org_ids: list[UUID] | None = None,
        owned_workspace_ids: list[UUID] | None = None,
        org_other_owner: bool = True,
    ) -> None:
        self._owned_org_ids = owned_org_ids or []
        self._owned_workspace_ids = owned_workspace_ids or []
        self._org_other_owner = org_other_owner

    async def list_owned_org_ids(self, *, user_id: UUID) -> list[UUID]:
        _ = user_id
        return list(self._owned_org_ids)

    async def org_has_other_owner(self, *, organization_id: UUID, user_id: UUID) -> bool:
        _ = organization_id, user_id
        return self._org_other_owner

    async def list_owned_workspace_ids(self, *, user_id: UUID) -> list[UUID]:
        _ = user_id
        return list(self._owned_workspace_ids)

    def transfer_workspaces(self) -> None:
        self._owned_workspace_ids = []


@pytest.mark.asyncio
async def test_account_delete_blocked_when_last_org_owner() -> None:
    user_id = uuid4()
    org_id = uuid4()
    guard = AccountDeletionGuard(data=FakeData(owned_org_ids=[org_id], org_other_owner=False))

    with pytest.raises(Forbidden) as exc:
        await guard.ensure_deletable(user_id=user_id)

    assert exc.value.error == "ACCOUNT_DELETE_LAST_ORG_OWNER"
    assert exc.value.meta == {"organization_id": str(org_id)}


@pytest.mark.asyncio
async def test_account_delete_requires_workspace_ownership_transfer() -> None:
    user_id = uuid4()
    ws_id = uuid4()
    data = FakeData(owned_workspace_ids=[ws_id])
    guard = AccountDeletionGuard(data=data)

    with pytest.raises(Forbidden) as exc:
        await guard.ensure_deletable(user_id=user_id)

    assert exc.value.error == "ACCOUNT_DELETE_OWNED_WORKSPACE_REQUIRES_TRANSFER"
    assert exc.value.meta == {"workspace_id": str(ws_id)}

    data.transfer_workspaces()
    await guard.ensure_deletable(user_id=user_id)


@pytest.mark.asyncio
async def test_account_delete_allowed_when_has_other_owners() -> None:
    user_id = uuid4()
    guard = AccountDeletionGuard(
        data=FakeData(
            owned_org_ids=[uuid4()],
            org_other_owner=True,
        )
    )
    await guard.ensure_deletable(user_id=user_id)
