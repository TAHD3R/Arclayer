from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.core.exceptions import Forbidden
from src.modules.projects.content.views.service import ContentLibraryViewsService
from src.modules.projects.http.router_helpers import ensure_project_permission_granted
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context


def get_content_library_views_service(
    settings: Annotated[Settings, Depends(get_settings)],
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
) -> ContentLibraryViewsService:
    return ContentLibraryViewsService(
        settings,
        resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id),
    )


async def resolve_can_manage_project_views(*, user_id: UUID, ctx: ProjectRequestContext) -> bool:
    try:
        await ensure_project_permission_granted(
            "project:content:manage",
            user_id=user_id,
            ctx=ctx,
        )
    except Forbidden:
        return False
    return True
