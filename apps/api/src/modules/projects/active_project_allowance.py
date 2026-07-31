from __future__ import annotations

from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import (
    CommercePlanRevisionResourceAllowance,
    PlanRevisionStatus,
    ResourceLimitKind,
    WorkspaceSubscription,
)
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace

ACTIVE_PROJECT_RESOURCE_KEY = "projects.active"


class LimitedActiveProjectAllowance(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    limit: int


class UnlimitedActiveProjectAllowance(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    pass


type ActiveProjectAllowance = LimitedActiveProjectAllowance | UnlimitedActiveProjectAllowance


class ActiveProjectAllowanceRecord(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    limit_kind: object
    limit_value: object


class ActiveProjectAllowancePersistence(Protocol):
    async def lock_workspace_capacity_scope(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> None: ...

    async def get_active_project_allowances(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[ActiveProjectAllowanceRecord] | None: ...

    async def count_active_projects(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> int: ...


class ActiveProjectAllowanceAuthority(Protocol):
    async def claim(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> ActiveProjectAllowance: ...

    async def lock_capacity_scope(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> None: ...


class ProjectActiveAllowanceRepository(TortoiseORMRepository):
    async def lock_workspace_capacity_scope(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> None:
        workspace = await (
            Workspace.filter(id=workspace_id, deleted_at__isnull=True).using_db(conn).select_for_update().first()
        )
        if workspace is None:
            raise NotFound(message=t("errors", "WORKSPACE_NOT_FOUND"), error="WORKSPACE_NOT_FOUND")

    async def get_active_project_allowances(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[ActiveProjectAllowanceRecord] | None:
        subscription = (
            await WorkspaceSubscription
            .filter(workspace_id=workspace_id)
            .using_db(conn)
            .select_related("plan_revision")
            .first()
        )
        if subscription is None:
            return None
        if subscription.plan_revision.status != PlanRevisionStatus.PUBLISHED:
            return []

        rows = await (
            CommercePlanRevisionResourceAllowance
            .filter(
                plan_revision_id=subscription.plan_revision_id,
                resource__key=ACTIVE_PROJECT_RESOURCE_KEY,
                resource__is_active=True,
            )
            .using_db(conn)
            .all()
        )
        return [ActiveProjectAllowanceRecord(limit_kind=row.limit_kind, limit_value=row.limit_value) for row in rows]

    async def count_active_projects(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> int:
        # Project records are hard-deleted, so every row counted here is non-deleted.
        return await ProjectRecord.filter(workspace_id=workspace_id, is_active=True).using_db(conn).count()


class ProjectActiveAllowanceAuthority:
    def __init__(self, persistence: ActiveProjectAllowancePersistence) -> None:
        self._persistence = persistence

    async def claim(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> ActiveProjectAllowance:
        await self.lock_capacity_scope(workspace_id=workspace_id, conn=conn)
        allowance = await self._resolve_allowance(workspace_id=workspace_id, conn=conn)
        active_project_count = await self._persistence.count_active_projects(workspace_id=workspace_id, conn=conn)
        if isinstance(allowance, LimitedActiveProjectAllowance) and active_project_count >= allowance.limit:
            raise Conflict(
                message=t("errors", "BAD_REQUEST"),
                error="WORKSPACE_ACTIVE_PROJECT_LIMIT_REACHED",
            )
        return allowance

    async def lock_capacity_scope(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> None:
        await self._persistence.lock_workspace_capacity_scope(workspace_id=workspace_id, conn=conn)

    async def _resolve_allowance(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> ActiveProjectAllowance:
        rows = await self._persistence.get_active_project_allowances(workspace_id=workspace_id, conn=conn)
        if rows is None:
            raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_SUBSCRIPTION_REQUIRED")
        if len(rows) != 1:
            raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ACTIVE_PROJECT_ALLOWANCE_INVALID")

        allowance = rows[0]
        if allowance.limit_kind is ResourceLimitKind.UNLIMITED and allowance.limit_value is None:
            return UnlimitedActiveProjectAllowance()
        if allowance.limit_kind is ResourceLimitKind.LIMITED:
            if (
                isinstance(allowance.limit_value, int)
                and not isinstance(allowance.limit_value, bool)
                and allowance.limit_value > 0
            ):
                return LimitedActiveProjectAllowance(limit=allowance.limit_value)
        raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ACTIVE_PROJECT_ALLOWANCE_INVALID")


def build_project_active_allowance_authority() -> ProjectActiveAllowanceAuthority:
    return ProjectActiveAllowanceAuthority(ProjectActiveAllowanceRepository())
