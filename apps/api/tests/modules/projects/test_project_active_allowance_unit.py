from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.commerce.billing import ResourceLimitKind
from src.modules.projects.active_project_allowance import (
    ActiveProjectAllowanceRecord,
    LimitedActiveProjectAllowance,
    ProjectActiveAllowanceAuthority,
    UnlimitedActiveProjectAllowance,
)

_CONN = cast(BaseDBAsyncClient, object())


class _Persistence:
    def __init__(self, *, rows: list[ActiveProjectAllowanceRecord] | None, active_project_count: int) -> None:
        self.rows = rows
        self.active_project_count = active_project_count
        self.locked_workspace_ids: list[object] = []
        self.counted_workspace_ids: list[object] = []

    async def lock_workspace_capacity_scope(self, *, workspace_id, conn) -> None:
        self.locked_workspace_ids.append(workspace_id)

    async def get_active_project_allowances(self, *, workspace_id, conn):
        return self.rows

    async def count_active_projects(self, *, workspace_id, conn) -> int:
        self.counted_workspace_ids.append(workspace_id)
        return self.active_project_count


@pytest.mark.asyncio
async def test_claim_accepts_available_limited_allowance() -> None:
    workspace_id = uuid4()
    persistence = _Persistence(
        rows=[ActiveProjectAllowanceRecord(limit_kind=ResourceLimitKind.LIMITED, limit_value=2)],
        active_project_count=1,
    )
    authority = ProjectActiveAllowanceAuthority(persistence)

    allowance = await authority.claim(workspace_id=workspace_id, conn=_CONN)

    assert allowance == LimitedActiveProjectAllowance(limit=2)
    assert persistence.locked_workspace_ids == [workspace_id]
    assert persistence.counted_workspace_ids == [workspace_id]


@pytest.mark.asyncio
async def test_claim_rejects_limited_allowance_at_capacity() -> None:
    persistence = _Persistence(
        rows=[ActiveProjectAllowanceRecord(limit_kind=ResourceLimitKind.LIMITED, limit_value=1)],
        active_project_count=1,
    )

    with pytest.raises(Conflict) as exc_info:
        await ProjectActiveAllowanceAuthority(persistence).claim(workspace_id=uuid4(), conn=_CONN)

    assert exc_info.value.error == "WORKSPACE_ACTIVE_PROJECT_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_claim_accepts_explicit_unlimited_allowance() -> None:
    persistence = _Persistence(
        rows=[ActiveProjectAllowanceRecord(limit_kind=ResourceLimitKind.UNLIMITED, limit_value=None)],
        active_project_count=10_000,
    )

    allowance = await ProjectActiveAllowanceAuthority(persistence).claim(workspace_id=uuid4(), conn=_CONN)

    assert allowance == UnlimitedActiveProjectAllowance()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "rows,error",
    [
        (None, "WORKSPACE_SUBSCRIPTION_REQUIRED"),
        ([], "WORKSPACE_ACTIVE_PROJECT_ALLOWANCE_INVALID"),
        (
            [ActiveProjectAllowanceRecord(limit_kind=ResourceLimitKind.LIMITED, limit_value=0)],
            "WORKSPACE_ACTIVE_PROJECT_ALLOWANCE_INVALID",
        ),
        (
            [ActiveProjectAllowanceRecord(limit_kind=ResourceLimitKind.UNLIMITED, limit_value=1)],
            "WORKSPACE_ACTIVE_PROJECT_ALLOWANCE_INVALID",
        ),
    ],
)
async def test_claim_fails_closed_for_missing_or_malformed_allowance(rows, error: str) -> None:
    persistence = _Persistence(rows=rows, active_project_count=0)

    with pytest.raises(Conflict) as exc_info:
        await ProjectActiveAllowanceAuthority(persistence).claim(workspace_id=uuid4(), conn=_CONN)

    assert exc_info.value.error == error
