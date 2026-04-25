from __future__ import annotations

from uuid import UUID

from src.common.services import BaseService
from src.core.exceptions import BadRequest
from src.modules.domains.service import DomainBindingService
from src.modules.projects.runtime.site.repository import ProjectRuntimeSiteRepository


class ProjectRuntimeSiteService(BaseService):
    def __init__(self, settings) -> None:
        super().__init__(settings)
        self.repo = ProjectRuntimeSiteRepository()
        self.domain_bindings = DomainBindingService(settings)

    async def get_or_create_site_for_project_runtime(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        project_slug: str | None = None,
        project_name: str | None = None,
        actor_user_id: UUID | None,
    ):
        """
        Resolve or create the site attached to a project runtime.
        """

        if project_id is None or runtime_id is None:
            raise BadRequest("Project runtime identity is required", error="PROJECT_RUNTIME_IDENTITY_REQUIRED")

        existing = await self.repo.get_site_by_runtime_id(runtime_id=runtime_id)
        if existing is not None:
            await self.domain_bindings.ensure_platform_binding(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=existing.id,
                project_slug=str(project_slug or ""),
                actor_user_id=actor_user_id,
            )
            return existing

        fallback_name = str(project_name or "").strip()
        site_name = f"{fallback_name or 'Project'} Site"
        site_slug = str(project_slug or "").strip() or "project"

        site = await self.repo.create_site(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            slug=site_slug[:64],
            name=site_name,
            default_locale="zh-CN",
            fallback_locale="en-US",
            created_by_user_id=actor_user_id,
        )
        await self.domain_bindings.ensure_platform_binding(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site.id,
            project_slug=site_slug,
            actor_user_id=actor_user_id,
        )
        return site
