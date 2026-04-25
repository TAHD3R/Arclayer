from __future__ import annotations

from fastapi import Depends

from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.releases.service import ProjectReleasesService
from src.modules.tenancy.router_helpers import resolve_project_tenant_context


def get_project_releases_service(
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> ProjectReleasesService:
    return ProjectReleasesService(resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id))
