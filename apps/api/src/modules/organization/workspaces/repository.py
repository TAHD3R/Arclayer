from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceKind, WorkspaceMembership, WorkspaceMembershipStatus


class OrganizationWorkspaceRepository(TortoiseORMRepository):
    async def list_active_workspaces_for_org(self, *, organization_id: UUID) -> list[Workspace]:
        return (
            await Workspace
            .filter(organization_id=organization_id, is_active=True, deleted_at__isnull=True)
            .order_by("created_at")
            .all()
        )

    async def list_active_workspaces_for_member(self, *, organization_id: UUID, user_id: UUID) -> list[Workspace]:
        rows = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__organization_id=organization_id,
            workspace__is_active=True,
            workspace__deleted_at__isnull=True,
        ).values_list("workspace_id", flat=True)
        workspace_ids = [UUID(str(item)) for item in rows]
        if not workspace_ids:
            return []
        return await Workspace.filter(id__in=workspace_ids, is_active=True).order_by("created_at").all()

    async def get_active_workspace(self, *, organization_id: UUID, workspace_id: UUID) -> Workspace | None:
        return await Workspace.get_or_none(
            id=workspace_id,
            organization_id=organization_id,
            is_active=True,
            deleted_at__isnull=True,
        )

    async def get_active_workspace_by_id(self, *, workspace_id: UUID) -> Workspace | None:
        return await Workspace.get_or_none(id=workspace_id, is_active=True, deleted_at__isnull=True)

    async def get_by_id(self, *, workspace_id: UUID) -> Workspace | None:
        return await Workspace.get_or_none(id=workspace_id)

    async def get_by_id_in_connection(self, workspace_id: UUID, *, conn: BaseDBAsyncClient) -> Workspace | None:
        return await Workspace.get_or_none(id=workspace_id, using_db=conn)

    async def get_by_id_for_update(self, workspace_id: UUID, *, conn: BaseDBAsyncClient) -> Workspace | None:
        return await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()

    async def list_active_by_ids(self, *, workspace_ids: Sequence[UUID]) -> list[Workspace]:
        if not workspace_ids:
            return []
        return (
            await Workspace
            .filter(id__in=list(workspace_ids), is_active=True, deleted_at__isnull=True)
            .order_by("created_at")
            .all()
        )

    async def list_non_deleted_by_ids(self, *, workspace_ids: Sequence[UUID]) -> list[Workspace]:
        if not workspace_ids:
            return []
        return await Workspace.filter(id__in=list(workspace_ids), deleted_at__isnull=True).order_by("created_at").all()

    async def list_active_by_organization_ids(self, *, organization_ids: Sequence[UUID]) -> list[Workspace]:
        if not organization_ids:
            return []
        return (
            await Workspace
            .filter(organization_id__in=list(organization_ids), is_active=True, deleted_at__isnull=True)
            .order_by("created_at")
            .all()
        )

    async def list_active_non_archived_for_org(self, *, organization_id: UUID) -> list[Workspace]:
        return (
            await Workspace
            .filter(organization_id=organization_id, is_active=True, archived_at=None)
            .order_by("created_at")
            .all()
        )

    async def list_all_workspaces(self) -> list[Workspace]:
        return list(await Workspace.all())

    async def count_active_workspaces(self, *, organization_id: UUID) -> int:
        return int(
            await Workspace.filter(organization_id=organization_id, is_active=True, deleted_at__isnull=True).count()
        )

    async def count_active_non_archived_workspaces(self, *, organization_id: UUID) -> int:
        return int(
            await Workspace.filter(
                organization_id=organization_id,
                is_active=True,
                archived_at__isnull=True,
                deleted_at__isnull=True,
            ).count()
        )

    async def create_workspace(
        self,
        *,
        organization_id: UUID,
        name: str,
        description: str | None,
        created_by_user_id: UUID,
        kind: WorkspaceKind = WorkspaceKind.TEAM,
        owner_user_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> Workspace:
        return await Workspace.create(
            using_db=conn,
            organization_id=organization_id,
            name=name,
            kind=kind,
            owner_user_id=owner_user_id,
            description=description,
            is_active=True,
            deleted_at=None,
            created_by_user_id=created_by_user_id,
        )

    async def list_active_memberships(
        self,
        *,
        workspace_ids: Sequence[UUID],
    ) -> list[WorkspaceMembership]:
        if not workspace_ids:
            return []
        return await WorkspaceMembership.filter(
            workspace_id__in=list(workspace_ids),
            status=WorkspaceMembershipStatus.ACTIVE,
        ).all()

    async def list_users(self, *, user_ids: Sequence[UUID]) -> list[User]:
        if not user_ids:
            return []
        return await User.filter(id__in=list(user_ids)).all()

    async def list_workspace_members(
        self,
        *,
        workspace_id: UUID,
        q: str | None,
        offset: int,
        limit: int,
    ) -> tuple[int, list[WorkspaceMembership]]:
        query = WorkspaceMembership.filter(
            workspace_id=workspace_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).select_related("user")

        needle = str(q or "").strip()
        if needle:
            query = query.filter(
                Q(user__username__icontains=needle)
                | Q(user__display_name__icontains=needle)
                | Q(user__email__icontains=needle)
            )

        total = int(await query.count())
        rows = await query.order_by("created_at").offset(offset).limit(limit).all()
        return total, rows

    async def ensure_active_membership(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceMembership:
        membership, _created = await WorkspaceMembership.get_or_create(
            using_db=conn,
            workspace_id=workspace_id,
            user_id=user_id,
            defaults={"status": WorkspaceMembershipStatus.ACTIVE, "invited_by_user_id": None},
        )
        if membership.status != WorkspaceMembershipStatus.ACTIVE:
            membership.status = WorkspaceMembershipStatus.ACTIVE
            await membership.save(update_fields=["status", "updated_at"], using_db=conn)
        return membership
