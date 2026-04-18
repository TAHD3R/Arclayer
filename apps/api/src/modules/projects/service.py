from __future__ import annotations

from uuid import UUID

from src.common.services.base import BaseService
from src.config import Settings
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.schema import ProjectDetailOut, ProjectOut, ProjectRuntimeOut


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
