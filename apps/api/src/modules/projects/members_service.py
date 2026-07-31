from __future__ import annotations

from typing import cast
from uuid import UUID

from src.common.protocols.tortoise import HasProjectId
from src.config import Settings
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.modules.projects.members_repository import ProjectMembersRepository
from src.modules.projects.members_schema import ProjectMemberOut, ProjectMemberRoleUpdateRequest


class ProjectMembersService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = ProjectMembersRepository()

    async def _bootstrap_project_memberships(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        existing = await self.repo.project_has_memberships(project_id=project_id)
        if existing:
            return

        workspace = await self.repo.get_workspace(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")

        workspace_user_ids = set(await self.repo.get_workspace_member_user_ids(workspace_id=workspace_id))
        owner_user_id = await self.repo.get_owner_user_id(workspace_id=workspace_id)
        member_user_ids = workspace_user_ids | {owner_user_id}
        if not member_user_ids:
            return

        rows = []
        for user_id in sorted(member_user_ids):
            role = ProjectMemberRole.OWNER if user_id == owner_user_id else ProjectMemberRole.VIEWER
            rows.append(
                ProjectMembership(
                    project_id=project_id,
                    user_id=user_id,
                    role=role,
                    created_by_user_id=actor_user_id,
                )
            )

        await self.repo.bulk_create_memberships(rows=rows)

    def _build_member_out(self, *, membership: ProjectMembership, workspace_id: UUID) -> ProjectMemberOut:
        user = membership.user
        return ProjectMemberOut(
            id=membership.id,
            project_id=UUID(str(cast(HasProjectId, membership).project_id)),
            workspace_id=workspace_id,
            user_id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            user_status=user.status,
            role=membership.role,
        )

    async def list_members(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        params: PageParams,
        q: str | None,
        actor_user_id: UUID,
    ) -> PageData[ProjectMemberOut]:
        await self._bootstrap_project_memberships(
            project_id=project_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
        )

        qs = self.repo.query_memberships(project_id=project_id, workspace_id=workspace_id, q=q)
        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).all()

        items = [self._build_member_out(membership=row, workspace_id=workspace_id) for row in rows]
        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[ProjectMemberOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def update_member_role(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        membership_id: UUID,
        payload: ProjectMemberRoleUpdateRequest,
        actor_user_id: UUID,
    ) -> ProjectMemberOut:
        await self._bootstrap_project_memberships(
            project_id=project_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
        )

        membership = await self.repo.get_membership(project_id=project_id, membership_id=membership_id)
        if membership is None:
            raise NotFound("Project member not found", error="PROJECT_MEMBER_NOT_FOUND")

        membership.role = payload.role
        await membership.save(update_fields=["role", "updated_at"])
        membership = await self.repo.get_membership(project_id=project_id, membership_id=membership_id)
        if membership is None:
            raise NotFound("Project member not found", error="PROJECT_MEMBER_NOT_FOUND")
        return self._build_member_out(membership=membership, workspace_id=workspace_id)
