from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from src.common.services.base import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.http.pagination import PageParams, paginate_items
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.schema import (
    ProjectArchiveResult,
    ProjectCreateRequest,
    ProjectDangerActionOut,
    ProjectDangerCapabilitiesOut,
    ProjectDeleteResult,
    ProjectDetailOut,
    ProjectListItemOut,
    ProjectListOut,
    ProjectMemberPreviewOut,
    ProjectOut,
    ProjectRuntimeOut,
    ProjectSlugAvailabilityOut,
    ProjectUpdateRequest,
)


class ProjectService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = ProjectRepository()

    async def get_project_detail(self, *, project_id: UUID) -> ProjectDetailOut:
        project, workspace = await self.repo.get_project_with_workspace(project_id=project_id)
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        return ProjectDetailOut(
            project=self._build_project_out(project=project, workspace=workspace),
            primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
        )

    async def list_projects(
        self,
        *,
        workspace_id: UUID | None,
        actor_user_id: UUID,
        params: PageParams,
        q: str | None,
        archived: bool,
    ) -> ProjectListOut:
        projects = await self.repo.list_projects(
            workspace_id=workspace_id,
            user_id=actor_user_id,
            q=q,
            is_active=not archived,
        )
        workspace_ids = list({UUID(str(project.workspace_id)) for project in projects})
        workspaces = await Workspace.filter(id__in=workspace_ids, deleted_at__isnull=True).all()
        workspace_by_id = {UUID(str(workspace.id)): workspace for workspace in workspaces}

        memberships = await self.repo.list_project_memberships(
            project_ids=[UUID(str(project.id)) for project in projects]
        )
        member_count_by_project: dict[UUID, int] = defaultdict(int)
        members_preview_by_project: dict[UUID, list[ProjectMemberPreviewOut]] = defaultdict(list)
        for membership in memberships:
            project_id = UUID(str(membership.project_id))
            member_count_by_project[project_id] += 1
            if len(members_preview_by_project[project_id]) >= 3:
                continue
            members_preview_by_project[project_id].append(self._build_member_preview(user=membership.user))

        items: list[ProjectListItemOut] = []
        for project in projects:
            workspace = workspace_by_id.get(UUID(str(project.workspace_id)))
            if workspace is None:
                continue
            runtime = await self.repo.get_primary_runtime(project_id=project.id)
            items.append(
                ProjectListItemOut(
                    **self._build_project_out(project=project, workspace=workspace).model_dump(),
                    primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
                    member_count=member_count_by_project.get(UUID(str(project.id)), 0),
                    members_preview=members_preview_by_project.get(UUID(str(project.id)), []),
                    archived_at=None if project.is_active else project.updated_at,
                    archived_by_user_id=None,
                    created_at=project.created_at,
                    enterable=True,
                )
            )

        page = paginate_items(items, params=params)
        return ProjectListOut(**page.model_dump())

    async def create_project(
        self,
        *,
        workspace_id: UUID,
        payload: ProjectCreateRequest,
        actor_user_id: UUID,
    ) -> ProjectDetailOut:
        await self._require_workspace(workspace_id=workspace_id)
        project = await self.repo.create_project(
            workspace_id=workspace_id,
            name=payload.name.strip(),
            slug=self._normalize_slug(payload.slug),
            description=(payload.description or "").strip() or None,
            actor_user_id=actor_user_id,
        )
        workspace = await Workspace.get(id=workspace_id)
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        return ProjectDetailOut(
            project=self._build_project_out(project=project, workspace=workspace),
            primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
        )

    async def update_project(
        self,
        *,
        project_id: UUID,
        payload: ProjectUpdateRequest,
    ) -> ProjectDetailOut:
        normalized_name = payload.name.strip() if payload.name is not None else None
        if normalized_name == "":
            raise BadRequest("Project name is required", error="PROJECT_NAME_REQUIRED")

        normalized_description = payload.description.strip() if payload.description is not None else None
        if normalized_description == "":
            normalized_description = None
        normalized_icon_color = payload.icon_color.strip() if payload.icon_color is not None else None
        if normalized_icon_color == "":
            normalized_icon_color = None
        normalized_icon_glyph = payload.icon_glyph.strip() if payload.icon_glyph is not None else None
        if normalized_icon_glyph == "":
            normalized_icon_glyph = None
        normalized_icon_emoji = payload.icon_emoji.strip() if payload.icon_emoji is not None else None
        if normalized_icon_emoji == "":
            normalized_icon_emoji = None
        normalized_icon_url = payload.icon_url.strip() if payload.icon_url is not None else None
        if normalized_icon_url == "":
            normalized_icon_url = None

        project = await self.repo.update_project(
            project_id=project_id,
            name=normalized_name,
            slug=self._normalize_slug(payload.slug) if payload.slug is not None else None,
            description=normalized_description,
            description_provided="description" in payload.model_fields_set,
            icon_mode=payload.icon_mode,
            icon_color=normalized_icon_color,
            icon_glyph=normalized_icon_glyph,
            icon_emoji=normalized_icon_emoji,
            icon_url=normalized_icon_url,
            icon_fields_provided=bool(
                {"icon_mode", "icon_color", "icon_glyph", "icon_emoji", "icon_url"} & payload.model_fields_set
            ),
        )
        workspace = await Workspace.get(id=project.workspace_id)
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        return ProjectDetailOut(
            project=self._build_project_out(project=project, workspace=workspace),
            primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
        )

    async def archive_project(self, *, project_id: UUID) -> ProjectArchiveResult:
        project = await self.repo.get_project_by_id(project_id=project_id)
        blocked_reason = await self._get_archive_blocked_reason(
            project_id=project_id,
            workspace_id=UUID(str(project.workspace_id)),
            can_manage_settings=True,
        )
        if blocked_reason is not None:
            raise BadRequest("Project archive is blocked", error=blocked_reason)
        project = await self.repo.set_project_active(project_id=project_id, is_active=False)
        return ProjectArchiveResult(project_id=project.id, is_active=project.is_active)

    async def unarchive_project(self, *, project_id: UUID) -> ProjectArchiveResult:
        project = await self.repo.set_project_active(project_id=project_id, is_active=True)
        return ProjectArchiveResult(project_id=project.id, is_active=project.is_active)

    async def delete_project(self, *, project_id: UUID) -> ProjectDeleteResult:
        project = await self.repo.get_project_by_id(project_id=project_id)
        blocked_reason = await self._get_delete_blocked_reason(
            project_id=project_id,
            workspace_id=UUID(str(project.workspace_id)),
            can_manage_settings=True,
        )
        if blocked_reason is not None:
            raise BadRequest("Project delete is blocked", error=blocked_reason)
        deleted = await self.repo.delete_project(project_id=project_id)
        return ProjectDeleteResult(project_id=project_id, deleted=deleted)

    async def get_danger_capabilities(
        self,
        *,
        project_id: UUID,
        can_manage_settings: bool,
    ) -> ProjectDangerCapabilitiesOut:
        project, workspace = await self.repo.get_project_with_workspace(project_id=project_id)
        archive_blocked_reason = await self._get_archive_blocked_reason(
            project_id=project.id,
            workspace_id=UUID(str(project.workspace_id)),
            can_manage_settings=can_manage_settings,
        )
        delete_blocked_reason = await self._get_delete_blocked_reason(
            project_id=project.id,
            workspace_id=UUID(str(project.workspace_id)),
            can_manage_settings=can_manage_settings,
        )
        return ProjectDangerCapabilitiesOut(
            project_id=project.id,
            workspace_id=project.workspace_id,
            organization_id=workspace.organization_id,
            confirm_delete_name=project.name,
            archive_action=ProjectDangerActionOut(
                enabled=archive_blocked_reason is None,
                blocked_reason=archive_blocked_reason,
            ),
            delete_action=ProjectDangerActionOut(
                enabled=delete_blocked_reason is None,
                blocked_reason=delete_blocked_reason,
            ),
        )

    async def check_slug_availability(
        self,
        *,
        workspace_id: UUID,
        slug: str,
        exclude_project_id: UUID | None = None,
    ) -> ProjectSlugAvailabilityOut:
        await self._require_workspace(workspace_id=workspace_id)
        normalized_slug, reason = await self.repo.check_slug_availability(
            workspace_id=workspace_id,
            slug=slug,
            exclude_project_id=exclude_project_id,
        )
        return ProjectSlugAvailabilityOut(
            normalized_slug=normalized_slug,
            available=normalized_slug is not None and reason is None,
            reason=reason,
        )

    async def _require_workspace(self, *, workspace_id: UUID) -> None:
        workspace = await Workspace.get_or_none(id=workspace_id, deleted_at__isnull=True)
        if workspace is None or not bool(workspace.is_active):
            raise BadRequest("Workspace not found", error="WORKSPACE_NOT_FOUND")

    def _normalize_slug(self, slug: str | None) -> str | None:
        if slug is None:
            return None
        normalized = slug.strip().lower()
        if not normalized:
            raise BadRequest("Project slug is required", error="PROJECT_SLUG_REQUIRED")
        return normalized

    def _build_project_out(self, *, project, workspace: Workspace) -> ProjectOut:
        return ProjectOut(
            id=project.id,
            organization_id=workspace.organization_id,
            workspace_id=project.workspace_id,
            slug=project.slug,
            name=project.name,
            description=project.description,
            icon_mode=project.icon_mode,
            icon_color=project.icon_color,
            icon_glyph=project.icon_glyph,
            icon_emoji=project.icon_emoji,
            icon_url=project.icon_url,
            is_active=project.is_active,
        )

    def _build_member_preview(self, *, user: User) -> ProjectMemberPreviewOut:
        return ProjectMemberPreviewOut(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            avatar_url=user.avatar_url,
        )

    async def _get_archive_blocked_reason(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        can_manage_settings: bool,
    ) -> str | None:
        if not can_manage_settings:
            return "WORKSPACE_SETTINGS_MANAGE_REQUIRED"
        project = await self.repo.get_project_by_id(project_id=project_id)
        if not bool(project.is_active):
            return None
        active_count = await self.repo.count_active_projects_in_workspace(workspace_id=workspace_id)
        if active_count <= 1:
            return "LAST_ACTIVE_PROJECT_NOT_ARCHIVABLE"
        return None

    async def _get_delete_blocked_reason(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        can_manage_settings: bool,
    ) -> str | None:
        if not can_manage_settings:
            return "WORKSPACE_SETTINGS_MANAGE_REQUIRED"
        project = await self.repo.get_project_by_id(project_id=project_id)
        if not bool(project.is_active):
            return None
        active_count = await self.repo.count_active_projects_in_workspace(
            workspace_id=workspace_id,
            exclude_project_id=project_id,
        )
        if active_count <= 0:
            return "LAST_ACTIVE_PROJECT_NOT_DELETABLE"
        return None
