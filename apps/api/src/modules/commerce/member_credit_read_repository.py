from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.credit_allocation import (
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
    WorkspaceMemberCreditUsagePeriod,
)
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus


class MemberCreditReadStore(Protocol):
    async def lock_policy(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceMemberCreditPolicy | None: ...

    async def list_active_memberships(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID | None,
        limit: int,
        offset: int,
        conn: BaseDBAsyncClient,
    ) -> tuple[int, list[WorkspaceMembership]]: ...

    async def list_overrides(
        self,
        *,
        workspace_id: UUID,
        membership_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, WorkspaceMemberCreditLimitOverride]: ...

    async def list_usage_periods(
        self,
        *,
        workspace_id: UUID,
        membership_ids: tuple[UUID, ...],
        period_start: datetime,
        period_end: datetime,
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, WorkspaceMemberCreditUsagePeriod]: ...


class TortoiseMemberCreditReadRepository(TortoiseORMRepository[WorkspaceMembership]):
    def __init__(self) -> None:
        super().__init__(WorkspaceMembership)

    async def lock_policy(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceMemberCreditPolicy | None:
        return await (
            WorkspaceMemberCreditPolicy.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )

    async def list_active_memberships(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID | None,
        limit: int,
        offset: int,
        conn: BaseDBAsyncClient,
    ) -> tuple[int, list[WorkspaceMembership]]:
        query = (
            WorkspaceMembership
            .filter(workspace_id=workspace_id, status=WorkspaceMembershipStatus.ACTIVE)
            .using_db(conn)
            .select_related("user", "workspace")
        )
        if membership_id is not None:
            query = query.filter(id=membership_id)
        total = int(await query.count())
        if total == 0 or offset >= total:
            return total, []
        rows = await query.order_by("-created_at", "-id").offset(offset).limit(limit)
        return total, list(rows)

    async def list_overrides(
        self,
        *,
        workspace_id: UUID,
        membership_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, WorkspaceMemberCreditLimitOverride]:
        if not membership_ids:
            return {}
        rows = await WorkspaceMemberCreditLimitOverride.filter(
            workspace_id=workspace_id, membership_id__in=membership_ids
        ).using_db(conn)
        return {UUID(str(row.membership_id)): row for row in rows}

    async def list_usage_periods(
        self,
        *,
        workspace_id: UUID,
        membership_ids: tuple[UUID, ...],
        period_start: datetime,
        period_end: datetime,
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, WorkspaceMemberCreditUsagePeriod]:
        if not membership_ids:
            return {}
        rows = await WorkspaceMemberCreditUsagePeriod.filter(
            workspace_id=workspace_id,
            membership_id__in=membership_ids,
            period_start=period_start,
            period_end=period_end,
        ).using_db(conn)
        return {UUID(str(row.membership_id)): row for row in rows}
