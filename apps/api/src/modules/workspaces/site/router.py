from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request, status

from src.config import Settings, get_settings
from src.core.http.response import Response, ResponseModel
from src.infra.cache.valkey import get_valkey
from src.modules.auth.http.service import get_current_user_id
from src.modules.sites.schema import SitePreviewTokenCreateIn, SitePreviewTokenOut
from src.modules.sites.service import SiteService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.site.schema import WorkspaceSiteOut
from src.modules.workspaces.site.service import WorkspaceSiteService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/site",
    tags=["Workspace: Site"],
    dependencies=[require_workspace_permission("system:site:read")],
)


def get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)


async def _resolve_site_id(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Settings = Depends(get_settings),
) -> UUID:
    service = WorkspaceSiteService(settings)
    site = await service.get_or_create_site_for_workspace(workspace_id=ctx.workspace_id, actor_user_id=user_id)
    return site.id


@router.get(
    "",
    response_model=ResponseModel[WorkspaceSiteOut],
    response_model_exclude_none=True,
    summary="Get the workspace site (single-site workspace model)",
)
async def get_workspace_site(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceSiteOut]:
    service = WorkspaceSiteService(settings)
    site = await service.get_or_create_site_for_workspace(workspace_id=ctx.workspace_id, actor_user_id=user_id)
    out = WorkspaceSiteOut(
        siteId=site.id,
        workspaceId=ctx.workspace_id,
        slug=str(site.slug),
        name=str(site.name),
        defaultLocale=str(site.default_locale),
        fallbackLocale=str(site.fallback_locale),
        isActive=bool(site.is_active),
    )
    return Response.success(data=out)


@router.post(
    "/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Issue a preview token for Portal editor/preview (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:site:manage")],
)
async def create_workspace_site_preview_token(
    payload: Annotated[SitePreviewTokenCreateIn, Body(description="Preview token request.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePreviewTokenOut]:
    data = await service.create_preview_token(site_id=site_id, ttl_seconds=payload.ttl_seconds)
    return Response.success(data=data)
