from __future__ import annotations

from uuid import UUID

from src.common.services.base import BaseService
from src.config import Settings
from src.core.http.pagination import PageParams, paginate_items
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.schema import (
    ProjectCreateRequest,
    ProjectDetailOut,
    ProjectListItemOut,
    ProjectListOut,
    ProjectOut,
    ProjectRuntimeOut,
)


class ProjectService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = ProjectRepository()

    async def get_project_detail(self, *, project_id: UUID) -> ProjectDetailOut:
        project = await self.repo.get_project_by_id(project_id=project_id)
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        return ProjectDetailOut(
            project=ProjectOut.model_validate(project),
            primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
        )

    async def list_projects(
        self,
        *,
        workspace_id: UUID,
        params: PageParams,
        q: str | None,
    ) -> ProjectListOut:
        projects = await self.repo.list_projects_by_workspace_id(
            workspace_id=workspace_id,
            q=q,
            is_active=True,
        )
        items: list[ProjectListItemOut] = []
        for project in projects:
            runtime = await self.repo.get_primary_runtime(project_id=project.id)
            items.append(
                ProjectListItemOut(
                    **ProjectOut.model_validate(project).model_dump(),
                    primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
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
        project = await self.repo.create_project(
            workspace_id=workspace_id,
            name=payload.name.strip(),
            description=(payload.description or "").strip() or None,
            actor_user_id=actor_user_id,
        )
        runtime = await self.repo.get_primary_runtime(project_id=project.id)
        return ProjectDetailOut(
            project=ProjectOut.model_validate(project),
            primary_runtime=ProjectRuntimeOut.model_validate(runtime) if runtime is not None else None,
        )
