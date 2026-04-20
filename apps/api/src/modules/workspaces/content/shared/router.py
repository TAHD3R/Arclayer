from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.core.exceptions import NotFound
from src.modules.projects.repository import ProjectRepository
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access


async def _resolve_site_id(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    settings: Settings = Depends(get_settings),
) -> UUID:
    repo = ProjectRepository()
    project = await repo.get_first_project_by_workspace_id(workspace_id=ctx.workspace_id)
    if project is None:
        raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
    runtime = await repo.get_primary_runtime(project_id=project.id)
    if runtime is None:
        raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
    site = await repo.get_runtime_site(runtime_id=runtime.id)
    if site is None:
        raise NotFound("Project runtime site bridge not found", error="PROJECT_RUNTIME_SITE_NOT_FOUND")
    return UUID(str(site.id))
