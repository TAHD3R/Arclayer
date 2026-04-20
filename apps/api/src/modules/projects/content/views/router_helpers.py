from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.projects.content.views.service import ContentLibraryViewsService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.schema import WorkspaceContext


def get_content_library_views_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ContentLibraryViewsService:
    return ContentLibraryViewsService(settings)


async def resolve_can_manage_project_views(*, user_id: UUID, ctx: WorkspaceContext) -> bool:
    try:
        await ensure_workspace_permission_granted(
            "system:content:manage",
            user_id=user_id,
            ctx=ctx,
        )
    except Exception as exc:
        if exc.__class__.__name__ != "Forbidden":
            raise
        return False
    return True
