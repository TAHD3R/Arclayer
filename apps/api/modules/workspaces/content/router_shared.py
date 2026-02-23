from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request

from apps.api.config import Settings, get_settings
from apps.api.infra.cache.valkey import get_valkey
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.sites.service import SiteService
from apps.api.modules.workspaces.content.service import WorkspaceContentService
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.modules.workspaces.site.service import WorkspaceSiteService


def get_workspace_content_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> WorkspaceContentService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    site_service = SiteService(settings, valkey=valkey)
    return WorkspaceContentService(settings, site_service=site_service)


async def _resolve_site_id(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Settings = Depends(get_settings),
) -> UUID:
    service = WorkspaceSiteService(settings)
    site = await service.get_or_create_site_for_workspace(workspace_id=ctx.workspace_id, actor_user_id=user_id)
    return site.id
