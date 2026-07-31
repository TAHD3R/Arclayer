from __future__ import annotations

from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import PlanRevisionStatus, WorkspaceSubscription
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace


class OwnedWorkspaceCommercialBinding(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    is_free_plan: bool | None


class FreeWorkspaceAllowancePersistence(Protocol):
    async def lock_user(self, *, user_id: UUID, conn: BaseDBAsyncClient) -> bool: ...

    async def list_owned_workspace_commercial_bindings(
        self,
        *,
        owner_user_id: UUID,
        excluding_workspace_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> list[OwnedWorkspaceCommercialBinding]: ...


class FreeWorkspaceAllowanceRepository(TortoiseORMRepository):
    async def lock_user(self, *, user_id: UUID, conn: BaseDBAsyncClient) -> bool:
        user = await User.filter(id=user_id).using_db(conn).select_for_update().first()
        return user is not None

    async def list_owned_workspace_commercial_bindings(
        self,
        *,
        owner_user_id: UUID,
        excluding_workspace_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> list[OwnedWorkspaceCommercialBinding]:
        workspace_query = Workspace.filter(owner_user_id=owner_user_id, deleted_at__isnull=True)
        if excluding_workspace_id is not None:
            workspace_query = workspace_query.exclude(id=excluding_workspace_id)
        workspace_ids = [
            UUID(str(value)) for value in await workspace_query.using_db(conn).values_list("id", flat=True)
        ]
        subscriptions = (
            await WorkspaceSubscription
            .filter(workspace_id__in=workspace_ids)
            .using_db(conn)
            .select_related("plan_revision__plan")
        )
        free_by_workspace = {
            UUID(str(subscription.workspace_id)): (
                subscription.plan_revision.status is PlanRevisionStatus.PUBLISHED
                and subscription.plan_revision.plan.code == "free"
            )
            for subscription in subscriptions
        }
        return [
            OwnedWorkspaceCommercialBinding(
                workspace_id=workspace_id,
                is_free_plan=free_by_workspace.get(workspace_id),
            )
            for workspace_id in workspace_ids
        ]


class FreeWorkspaceAllowanceAuthority:
    def __init__(self, persistence: FreeWorkspaceAllowancePersistence) -> None:
        self._persistence = persistence

    async def assert_eligible(
        self,
        *,
        prospective_owner_user_id: UUID,
        excluding_workspace_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        if not await self._persistence.lock_user(user_id=prospective_owner_user_id, conn=conn):
            raise NotFound(message=t("errors", "NOT_FOUND"), error="USER_NOT_FOUND")
        bindings = await self._persistence.list_owned_workspace_commercial_bindings(
            owner_user_id=prospective_owner_user_id,
            excluding_workspace_id=excluding_workspace_id,
            conn=conn,
        )
        missing_subscription_ids = [str(binding.workspace_id) for binding in bindings if binding.is_free_plan is None]
        if missing_subscription_ids:
            raise Conflict(
                message=t("errors", "BAD_REQUEST"),
                error="WORKSPACE_SUBSCRIPTION_REQUIRED",
                meta={"workspaceIds": missing_subscription_ids},
            )
        if any(binding.is_free_plan for binding in bindings):
            raise Conflict(
                message=t("errors", "BAD_REQUEST"),
                error="FREE_WORKSPACE_ALLOWANCE_EXHAUSTED",
            )


def build_free_workspace_allowance_authority() -> FreeWorkspaceAllowanceAuthority:
    return FreeWorkspaceAllowanceAuthority(FreeWorkspaceAllowanceRepository())
