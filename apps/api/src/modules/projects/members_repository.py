from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from src.common.repositories import BaseRepository
from src.models.projects.membership import ProjectMembership
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus


class ProjectMembersRepository(BaseRepository):
    def query_memberships(self, *, project_id: UUID, workspace_id: UUID, q: str | None) -> QuerySet[ProjectMembership]:
        qs = ProjectMembership.filter(project_id=project_id).select_related("user", "project")

        needle = (q or "").strip()
        if needle:
            qs = qs.filter(
                Q(user__username__icontains=needle)
                | Q(user__email__icontains=needle)
                | Q(user__display_name__icontains=needle)
            )

        return qs.order_by("role", "user__username", "created_at", "id")

    async def get_membership(self, *, project_id: UUID, membership_id: UUID) -> ProjectMembership | None:
        return await ProjectMembership.get_or_none(id=membership_id, project_id=project_id).select_related(
            "user", "project"
        )

    async def get_workspace_member_user_ids(self, *, workspace_id: UUID) -> list[UUID]:
        rows = await WorkspaceMembership.filter(
            workspace_id=workspace_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).values_list("user_id", flat=True)
        return [UUID(str(value)) for value in rows]
