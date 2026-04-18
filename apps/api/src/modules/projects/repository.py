from __future__ import annotations

from uuid import UUID

from src.common.repositories.base import BaseRepository
from src.core.exceptions import NotFound
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeKind, ProjectRuntimeRecord
from src.models.workspaces.workspace import Workspace


class ProjectRepository(BaseRepository):
    async def get_first_project_by_workspace_id(self, *, workspace_id: UUID) -> ProjectRecord | None:
        return await ProjectRecord.filter(workspace_id=workspace_id).order_by("created_at", "id").first()

    async def get_project_by_id(self, *, project_id: UUID) -> ProjectRecord:
        project = await ProjectRecord.get_or_none(id=project_id)
        if project is None:
            raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
        return project

    async def get_or_create_primary_project_for_workspace(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID | None,
    ) -> ProjectRecord:
        existing = await self.get_first_project_by_workspace_id(workspace_id=workspace_id)
        if existing is not None:
            return existing

        workspace = await Workspace.get_or_none(id=workspace_id)
        if workspace is None:
            raise NotFound("Workspace not found", error="WORKSPACE_NOT_FOUND")

        return await ProjectRecord.create(
            workspace_id=workspace_id,
            slug=(workspace.slug or "project")[:64],
            name=(workspace.name or "Project")[:128],
            description=workspace.description,
            is_active=bool(workspace.is_active),
            created_by_user_id=actor_user_id,
        )

    async def get_primary_runtime(self, *, project_id: UUID) -> ProjectRuntimeRecord | None:
        return await ProjectRuntimeRecord.get_or_none(project_id=project_id, kind=ProjectRuntimeKind.PRIMARY)

    async def get_runtime_by_id(self, *, runtime_id: UUID) -> ProjectRuntimeRecord:
        runtime = await ProjectRuntimeRecord.get_or_none(id=runtime_id)
        if runtime is None:
            raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
        return runtime

    async def get_primary_project_ids_by_workspace_ids(
        self,
        *,
        workspace_ids: list[UUID],
    ) -> dict[UUID, UUID]:
        if not workspace_ids:
            return {}

        rows = (
            await ProjectRecord
            .filter(workspace_id__in=workspace_ids, is_active=True)
            .order_by("workspace_id", "created_at", "id")
            .values("id", "workspace_id")
        )

        project_ids_by_workspace: dict[UUID, UUID] = {}
        for row in rows:
            workspace_id = UUID(str(row["workspace_id"]))
            if workspace_id in project_ids_by_workspace:
                continue
            project_ids_by_workspace[workspace_id] = UUID(str(row["id"]))
        return project_ids_by_workspace
