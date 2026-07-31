from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import PlanRevisionStatus, WorkspaceSubscription
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.workspaces.ownership_transfer import WorkspaceOwnershipTransfer
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus


class WorkspaceOwnershipRepository(TortoiseORMRepository):
    async def lock_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace | None:
        return (
            await Workspace.filter(id=workspace_id, deleted_at__isnull=True).using_db(conn).select_for_update().first()
        )

    async def get_transfer_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceOwnershipTransfer | None:
        return await WorkspaceOwnershipTransfer.get_or_none(
            workspace_id=workspace_id,
            idempotency_key=idempotency_key,
            using_db=conn,
        )

    async def has_active_membership(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool:
        return (
            await WorkspaceMembership
            .filter(
                workspace_id=workspace_id,
                user_id=user_id,
                status=WorkspaceMembershipStatus.ACTIVE,
            )
            .using_db(conn)
            .exists()
        )

    async def is_bound_to_free_plan(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> bool | None:
        subscription = (
            await WorkspaceSubscription
            .filter(workspace_id=workspace_id)
            .using_db(conn)
            .select_related("plan_revision__plan")
            .first()
        )
        if subscription is None or subscription.plan_revision.status is not PlanRevisionStatus.PUBLISHED:
            return None
        return subscription.plan_revision.plan.code == "free"

    async def save_owner(self, *, workspace: Workspace, owner_user_id: UUID, conn: BaseDBAsyncClient) -> None:
        workspace.owner_user_id = owner_user_id
        await workspace.save(update_fields=["owner_user_id", "updated_at"], using_db=conn)

    async def rebind_project_ownership(
        self,
        *,
        workspace_id: UUID,
        next_owner_user_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        project_ids = [
            UUID(str(value))
            for value in await ProjectRecord
            .filter(workspace_id=workspace_id)
            .using_db(conn)
            .values_list("id", flat=True)
        ]
        if not project_ids:
            return
        await (
            ProjectMembership
            .filter(
                project_id__in=project_ids,
                role=ProjectMemberRole.OWNER,
            )
            .using_db(conn)
            .update(role=ProjectMemberRole.VIEWER)
        )
        for project_id in project_ids:
            await ProjectMembership.update_or_create(
                project_id=project_id,
                user_id=next_owner_user_id,
                defaults={
                    "role": ProjectMemberRole.OWNER,
                    "created_by_user_id": actor_user_id,
                },
                using_db=conn,
            )

    async def create_transfer(
        self,
        *,
        workspace_id: UUID,
        previous_owner_user_id: UUID,
        next_owner_user_id: UUID,
        initiated_by_user_id: UUID,
        idempotency_key: str,
        correlation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceOwnershipTransfer:
        return await WorkspaceOwnershipTransfer.create(
            using_db=conn,
            workspace_id=workspace_id,
            previous_owner_user_id=previous_owner_user_id,
            next_owner_user_id=next_owner_user_id,
            initiated_by_user_id=initiated_by_user_id,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
        )
