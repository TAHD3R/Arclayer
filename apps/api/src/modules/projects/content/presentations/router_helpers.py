from __future__ import annotations

from fastapi import Depends

from src.modules.projects.content.contracts.schema import ContentPresentationListOut
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context


def get_project_content_presentations_service(
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> ProjectContentCanonicalItemReadService:
    return ProjectContentCanonicalItemReadService(
        repo=ProjectContentItemsRepository(
            resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id)
        )
    )


__all__ = [
    "ContentPresentationListOut",
    "ProjectContentCanonicalItemReadService",
    "get_project_content_presentations_service",
]
