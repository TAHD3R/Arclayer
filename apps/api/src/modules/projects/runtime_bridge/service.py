from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from src.config import Settings
from src.modules.projects.runtime.service import ProjectRuntimeService


@dataclass(slots=True)
class ProjectRuntimeBridgeContext:
    project_id: UUID
    workspace_id: UUID
    site_id: UUID
    runtime_id: UUID
    site_slug: str
    runtime_name: str
    default_locale: str
    fallback_locale: str
    is_active: bool


class ProjectRuntimeBridgeService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.runtime_service = ProjectRuntimeService(settings)

    async def get_context(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID | None,
    ) -> ProjectRuntimeBridgeContext:
        runtime = await self.runtime_service.get_context_by_project(
            project_id=project_id,
            actor_user_id=actor_user_id,
        )
        return ProjectRuntimeBridgeContext(
            project_id=runtime.project_id,
            workspace_id=runtime.workspace_id,
            site_id=runtime.site_id,
            runtime_id=runtime.runtime_id,
            site_slug=runtime.slug,
            runtime_name=runtime.name,
            default_locale=runtime.default_locale,
            fallback_locale=runtime.fallback_locale,
            is_active=runtime.is_active,
        )
