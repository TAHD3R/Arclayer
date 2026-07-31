from __future__ import annotations

from collections import defaultdict
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.common.utils.slug import slugify
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.http.pagination import PageParams, paginate_items
from src.core.services import BaseService
from src.models.organization.user import User
from src.models.projects._enums import ProjectAuthoringMode
from src.models.workspaces.workspace import Workspace
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.projects.active_project_allowance import (
    ActiveProjectAllowanceAuthority,
    build_project_active_allowance_authority,
)
from src.modules.projects.repository import PROJECT_RESERVED_SLUGS, ProjectRepository
from src.modules.projects.runtime.site.service import ProjectRuntimeSiteService
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
from src.settings.runtime import get_core_settings_value_cached


class ProjectService(BaseService):
    def __init__(self, settings: Settings, *, active_project_allowance: ActiveProjectAllowanceAuthority) -> None:
        super().__init__(settings)
        self.repo = ProjectRepository()
        self.workspace_repo = OrganizationWorkspaceRepository()
        self.runtime_site_service = ProjectRuntimeSiteService(settings)
        self._active_project_allowance = active_project_allowance

    async def _write_project_activity_event(
        self,
        *,
        event_name: str,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        payload: JsonObject = {
            "workspace_id": str(workspace_id),
            "project_id": str(project_id),
            "actor_user_id": str(actor_user_id),
        }
        payload.update(properties)
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="project",
                entity_id=project_id,
                source="api",
                properties=payload,
            ),
            conn=conn,
        )

    async def get_project_detail(self, *, project_id: UUID) -> ProjectDetailOut:
        project, _workspace = await self.repo.get_project_with_workspace(project_id=project_id)
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        return ProjectDetailOut(
            project=self._build_project_out(project=project),
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
        ordering: str | None,
    ) -> ProjectListOut:
        projects = await self.repo.list_projects(
            workspace_id=workspace_id,
            user_id=actor_user_id,
            q=q,
            is_active=not archived,
            ordering=ordering,
        )
        workspace_ids = list({UUID(str(project.workspace_id)) for project in projects})
        workspaces = await self.workspace_repo.list_non_deleted_by_ids(workspace_ids=workspace_ids)
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
                    **self._build_project_out(project=project).model_dump(),
                    primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
                    member_count=member_count_by_project.get(UUID(str(project.id)), 0),
                    members_preview=members_preview_by_project.get(UUID(str(project.id)), []),
                    archived_at=None if project.is_active else project.updated_at,
                    archived_by_user_id=None,
                    created_at=project.created_at,
                    updated_at=project.updated_at,
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
    ) -> ProjectListItemOut:
        await self._require_workspace(workspace_id=workspace_id)
        reserved_slugs = await self._reserved_project_slugs()
        authoring_mode = ProjectAuthoringMode(payload.authoring_mode)
        async with self.tx() as conn:
            await self._active_project_allowance.claim(workspace_id=workspace_id, conn=conn)
            project = await self.repo.create_project(
                workspace_id=workspace_id,
                name=payload.name.strip(),
                slug=self._normalize_slug(payload.slug),
                description=(payload.description or "").strip() or None,
                authoring_mode=authoring_mode,
                actor_user_id=actor_user_id,
                reserved_slugs=reserved_slugs,
                conn=conn,
            )
            project_id = UUID(str(project.id))
            await self.repo.bootstrap_project_memberships(
                project_id=project_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            runtime = await self.repo.get_primary_runtime(project_id=project.id, conn=conn)
            if runtime is None:
                raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
            await self.runtime_site_service.get_or_create_site_for_project_runtime(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=UUID(str(runtime.id)),
                project_slug=str(project.slug),
                project_name=str(project.name),
                actor_user_id=actor_user_id,
                conn=conn,
            )
            await self._write_project_activity_event(
                event_name="project.created",
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                properties={
                    "created": True,
                    "slug": str(project.slug),
                    "authoringMode": authoring_mode.value,
                    "initialized": ["primary_runtime", "environments", "runtime_site", "platform_domain_binding"],
                },
                conn=conn,
            )
        await self._get_active_workspace(workspace_id=workspace_id)
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        if runtime is None:
            raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
        memberships = await self.repo.list_project_memberships(project_ids=[UUID(str(project.id))])
        members_preview = [self._build_member_preview(user=membership.user) for membership in memberships[:3]]
        return ProjectListItemOut(
            **self._build_project_out(project=project).model_dump(),
            primary_runtime=ProjectRuntimeOut.model_validate(runtime),
            member_count=len(memberships),
            members_preview=members_preview,
            archived_at=None,
            archived_by_user_id=None,
            created_at=project.created_at,
            updated_at=project.updated_at,
            enterable=True,
        )

    async def update_project(
        self,
        *,
        project_id: UUID,
        payload: ProjectUpdateRequest,
        actor_user_id: UUID,
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

        updated_fields = sorted(
            field
            for field in (
                "name",
                "slug",
                "description",
                "icon_mode",
                "icon_color",
                "icon_glyph",
                "icon_emoji",
                "icon_url",
            )
            if field in payload.model_fields_set
        )
        reserved_slugs = await self._reserved_project_slugs()
        async with self.tx() as conn:
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
                reserved_slugs=reserved_slugs,
                conn=conn,
            )
            await self._write_project_activity_event(
                event_name="project.updated",
                workspace_id=UUID(str(project.workspace_id)),
                project_id=UUID(str(project.id)),
                actor_user_id=actor_user_id,
                properties={"updated_fields": updated_fields},
                conn=conn,
            )
        workspace = await self._get_active_workspace(workspace_id=UUID(str(project.workspace_id)))
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        return ProjectDetailOut(
            project=self._build_project_out(project=project),
            primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
        )

    async def archive_project(self, *, project_id: UUID, actor_user_id: UUID) -> ProjectArchiveResult:
        blocked_reason = self._get_archive_blocked_reason(can_manage_settings=True)
        if blocked_reason is not None:
            raise BadRequest("Project archive is blocked", error=blocked_reason)
        async with self.tx() as conn:
            existing_project = await self.repo.get_project_by_id_in_connection(project_id=project_id, conn=conn)
            await self._active_project_allowance.lock_capacity_scope(
                workspace_id=UUID(str(existing_project.workspace_id)),
                conn=conn,
            )
            project = await self.repo.set_project_active(project_id=project_id, is_active=False, conn=conn)
            await self._write_project_activity_event(
                event_name="project.archived",
                workspace_id=UUID(str(project.workspace_id)),
                project_id=UUID(str(project.id)),
                actor_user_id=actor_user_id,
                properties={"archived": True},
                conn=conn,
            )
        return ProjectArchiveResult(project_id=project.id, is_active=project.is_active)

    async def unarchive_project(self, *, project_id: UUID) -> ProjectArchiveResult:
        async with self.tx() as conn:
            existing_project = await self.repo.get_project_by_id_in_connection(project_id=project_id, conn=conn)
            await self._active_project_allowance.claim(
                workspace_id=UUID(str(existing_project.workspace_id)),
                conn=conn,
            )
            project = await self.repo.set_project_active(project_id=project_id, is_active=True, conn=conn)
        return ProjectArchiveResult(project_id=project.id, is_active=project.is_active)

    async def delete_project(self, *, project_id: UUID, actor_user_id: UUID) -> ProjectDeleteResult:
        blocked_reason = self._get_delete_blocked_reason(can_manage_settings=True)
        if blocked_reason is not None:
            raise BadRequest("Project delete is blocked", error=blocked_reason)
        async with self.tx() as conn:
            project = await self.repo.get_project_by_id_in_connection(project_id=project_id, conn=conn)
            await self._active_project_allowance.lock_capacity_scope(
                workspace_id=UUID(str(project.workspace_id)),
                conn=conn,
            )
            deleted = await self.repo.delete_project(project_id=project_id, conn=conn)
            await self._write_project_activity_event(
                event_name="project.deleted",
                workspace_id=UUID(str(project.workspace_id)),
                project_id=project_id,
                actor_user_id=actor_user_id,
                properties={"deleted": bool(deleted)},
                conn=conn,
            )
        return ProjectDeleteResult(project_id=project_id, deleted=deleted)

    async def get_danger_capabilities(
        self,
        *,
        project_id: UUID,
        can_manage_settings: bool,
    ) -> ProjectDangerCapabilitiesOut:
        project, _workspace = await self.repo.get_project_with_workspace(project_id=project_id)
        archive_blocked_reason = self._get_archive_blocked_reason(can_manage_settings=can_manage_settings)
        delete_blocked_reason = self._get_delete_blocked_reason(can_manage_settings=can_manage_settings)
        return ProjectDangerCapabilitiesOut(
            project_id=project.id,
            workspace_id=project.workspace_id,
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
        reserved_slugs = await self._reserved_project_slugs()
        normalized_slug, reason = await self.repo.check_slug_availability(
            workspace_id=workspace_id,
            slug=slug,
            exclude_project_id=exclude_project_id,
            reserved_slugs=reserved_slugs,
        )
        return ProjectSlugAvailabilityOut(
            normalized_slug=normalized_slug,
            available=normalized_slug is not None and reason is None,
            reason=reason,
        )

    async def _require_workspace(self, *, workspace_id: UUID) -> None:
        workspace = await self.workspace_repo.get_active_workspace_by_id(workspace_id=workspace_id)
        if workspace is None or not bool(workspace.is_active):
            raise BadRequest("Workspace not found", error="WORKSPACE_NOT_FOUND")

    async def _get_active_workspace(self, *, workspace_id: UUID) -> Workspace:
        workspace = await self.workspace_repo.get_active_workspace_by_id(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")
        return workspace

    def _normalize_slug(self, slug: str | None) -> str | None:
        if slug is None:
            return None
        normalized = slugify(slug)[:64]
        if not normalized:
            raise BadRequest("Project slug is required", error="PROJECT_SLUG_REQUIRED")
        return normalized

    async def _reserved_project_slugs(self) -> frozenset[str]:
        core = await get_core_settings_value_cached(self.settings)
        domains = core.get("domains") if isinstance(core, dict) else None
        configured_labels = (
            cast(dict[str, object], domains).get("reserved_labels") if isinstance(domains, dict) else None
        )
        if not isinstance(configured_labels, list):
            return PROJECT_RESERVED_SLUGS

        normalized = {
            slug for label in configured_labels if isinstance(label, str) for slug in [slugify(label)[:64]] if slug
        }
        return frozenset({*PROJECT_RESERVED_SLUGS, *normalized})

    def _build_project_out(self, *, project) -> ProjectOut:
        return ProjectOut(
            id=project.id,
            workspace_id=project.workspace_id,
            slug=project.slug,
            name=project.name,
            description=project.description,
            icon_mode=project.icon_mode,
            icon_color=project.icon_color,
            icon_glyph=project.icon_glyph,
            icon_emoji=project.icon_emoji,
            icon_url=project.icon_url,
            authoring_mode=project.authoring_mode,
            authoring_state=project.authoring_state,
            authoring_revision=project.authoring_revision,
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

    def _get_archive_blocked_reason(self, *, can_manage_settings: bool) -> str | None:
        if not can_manage_settings:
            return "WORKSPACE_SETTINGS_MANAGE_REQUIRED"
        return None

    def _get_delete_blocked_reason(self, *, can_manage_settings: bool) -> str | None:
        if not can_manage_settings:
            return "WORKSPACE_SETTINGS_MANAGE_REQUIRED"
        return None


def build_project_service(settings: Settings) -> ProjectService:
    return ProjectService(
        settings,
        active_project_allowance=build_project_active_allowance_authority(),
    )
