from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.modules.commerce.free_workspace_allowance import (
    FreeWorkspaceAllowanceAuthority,
    OwnedWorkspaceCommercialBinding,
)


class _AllowancePersistence:
    def __init__(self, bindings: list[OwnedWorkspaceCommercialBinding]) -> None:
        self.bindings = bindings
        self.locked_user_ids: list[UUID] = []

    async def lock_user(self, *, user_id: UUID, conn: BaseDBAsyncClient) -> bool:
        _ = conn
        self.locked_user_ids.append(user_id)
        return True

    async def list_owned_workspace_commercial_bindings(
        self,
        *,
        owner_user_id: UUID,
        excluding_workspace_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> list[OwnedWorkspaceCommercialBinding]:
        _ = owner_user_id
        _ = conn
        return [binding for binding in self.bindings if binding.workspace_id != excluding_workspace_id]


async def test_joined_workspaces_do_not_consume_free_workspace_allowance() -> None:
    owner_user_id = uuid4()
    persistence = _AllowancePersistence([])

    await FreeWorkspaceAllowanceAuthority(persistence).assert_eligible(
        prospective_owner_user_id=owner_user_id,
        excluding_workspace_id=None,
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert persistence.locked_user_ids == [owner_user_id]


async def test_existing_owned_free_workspace_exhausts_allowance() -> None:
    persistence = _AllowancePersistence([OwnedWorkspaceCommercialBinding(workspace_id=uuid4(), is_free_plan=True)])

    with pytest.raises(Conflict) as exc:
        await FreeWorkspaceAllowanceAuthority(persistence).assert_eligible(
            prospective_owner_user_id=uuid4(),
            excluding_workspace_id=None,
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc.value.error == "FREE_WORKSPACE_ALLOWANCE_EXHAUSTED"


async def test_missing_owned_workspace_subscription_fails_explicitly() -> None:
    missing_workspace_id = uuid4()
    persistence = _AllowancePersistence([
        OwnedWorkspaceCommercialBinding(workspace_id=missing_workspace_id, is_free_plan=None)
    ])

    with pytest.raises(Conflict) as exc:
        await FreeWorkspaceAllowanceAuthority(persistence).assert_eligible(
            prospective_owner_user_id=uuid4(),
            excluding_workspace_id=None,
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc.value.error == "WORKSPACE_SUBSCRIPTION_REQUIRED"
    assert exc.value.meta == {"workspaceIds": [str(missing_workspace_id)]}
