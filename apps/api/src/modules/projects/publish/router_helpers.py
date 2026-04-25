from __future__ import annotations

from fastapi import Depends

from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.publish.preview_service import ProjectPublishPreviewService
from src.modules.projects.publish.service import ProjectPublishService
from src.modules.tenancy.router_helpers import resolve_project_tenant_context


def get_project_publish_service(
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> ProjectPublishService:
    return ProjectPublishService(resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id))


def get_project_publish_preview_service(
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> ProjectPublishPreviewService:
    return ProjectPublishPreviewService(
        resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id)
    )
