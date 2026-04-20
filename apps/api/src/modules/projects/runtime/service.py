from __future__ import annotations

from dataclasses import dataclass
from typing import cast
from uuid import UUID

from src.common.protocols.tortoise import HasProjectId, HasWorkspaceId
from src.core.exceptions import NotFound
from src.models.projects.runtime import ProjectRuntimeRecord
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.runtime.schema import ProjectRuntimeBridgeOut, RuntimePreviewTokenOut
from src.modules.sites.preview.tokens.schema import SitePreviewTokenOut


@dataclass(slots=True)
class ProjectRuntimeContext:
    runtime_id: UUID
    project_id: UUID
    workspace_id: UUID
    site_id: UUID
    kind: str
    name: str
    slug: str
    default_locale: str
    fallback_locale: str
    is_active: bool


class ProjectRuntimeService:
    def __init__(self, settings) -> None:
        self.project_repo = ProjectRepository()

    async def get_context_by_project(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID | None,
    ) -> ProjectRuntimeContext:
        project = await self.project_repo.get_project_by_id(project_id=project_id)
        runtime = await self.project_repo.get_primary_runtime(project_id=project.id)
        if runtime is None:
            raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
        workspace_id = UUID(str(cast(HasWorkspaceId, project).workspace_id))
        return await self._build_context(
            runtime=runtime,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
        )

    async def get_context_by_runtime(
        self,
        *,
        runtime_id: UUID,
        actor_user_id: UUID | None,
    ) -> ProjectRuntimeContext:
        runtime = await self.project_repo.get_runtime_by_id(runtime_id=runtime_id)
        project_id = UUID(str(cast(HasProjectId, runtime).project_id))
        project = await self.project_repo.get_project_by_id(project_id=project_id)
        workspace_id = UUID(str(cast(HasWorkspaceId, project).workspace_id))
        return await self._build_context(
            runtime=runtime,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
        )

    async def _build_context(
        self,
        *,
        runtime: ProjectRuntimeRecord,
        workspace_id: UUID,
        actor_user_id: UUID | None,
    ) -> ProjectRuntimeContext:
        site = await self.project_repo.get_runtime_site(runtime_id=runtime.id)
        if site is None:
            raise NotFound("Project runtime site bridge not found", error="PROJECT_RUNTIME_SITE_NOT_FOUND")
        return ProjectRuntimeContext(
            runtime_id=runtime.id,
            project_id=UUID(str(cast(HasProjectId, runtime).project_id)),
            workspace_id=workspace_id,
            site_id=site.id,
            kind=str(runtime.kind),
            name=str(runtime.name),
            slug=str(site.slug),
            default_locale=str(site.default_locale),
            fallback_locale=str(site.fallback_locale),
            is_active=bool(runtime.is_active and site.is_active),
        )

    @staticmethod
    def to_bridge_out(context: ProjectRuntimeContext) -> ProjectRuntimeBridgeOut:
        return ProjectRuntimeBridgeOut(
            runtimeId=context.runtime_id,
            projectId=context.project_id,
            workspaceId=context.workspace_id,
            siteId=context.site_id,
            kind=context.kind,
            name=context.name,
            slug=context.slug,
            defaultLocale=context.default_locale,
            fallbackLocale=context.fallback_locale,
            isActive=context.is_active,
        )

    @staticmethod
    def to_preview_token_out(
        *,
        context: ProjectRuntimeContext,
        token: SitePreviewTokenOut,
    ) -> RuntimePreviewTokenOut:
        return RuntimePreviewTokenOut(
            runtimeId=context.runtime_id,
            siteId=context.site_id,
            token=token.token,
            expiresAtMs=token.expires_at_ms,
        )
