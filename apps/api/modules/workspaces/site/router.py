from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request, status

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.sites.schema import (
    SitePageCreateIn,
    SitePageDraftSaveIn,
    SitePageDraftSaveOut,
    SitePageMoveIn,
    SitePagePublishIn,
    SitePagePublishOut,
    SitePageRevisionOut,
    SitePageRollbackIn,
    SitePageRollbackOut,
    SitePageTreeNodeOut,
    SitePageUnpublishOut,
    SitePageUpdateIn,
    SitePreviewTokenCreateIn,
    SitePreviewTokenOut,
    SiteSettingGetOut,
    SiteSettingUpsertIn,
)
from apps.api.modules.sites.service import SiteService
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.modules.workspaces.site.schema import WorkspaceSiteOut
from apps.api.modules.workspaces.site.service import WorkspaceSiteService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/site",
    tags=["Workspace: Site"],
    dependencies=[require_workspace_permission("admin:access")],
)


def get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    """
    Workspace-scoped router still uses the same SiteService implementation,
    but auth is handled via workspace RBAC instead of preview tokens.
    """

    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)


async def _resolve_site_id(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Settings = Depends(get_settings),
) -> str:
    service = WorkspaceSiteService(settings)
    site = await service.get_or_create_site_for_workspace(workspace_id=ctx.workspace_id, actor_user_id=user_id)
    return str(site.id)


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
        siteId=str(site.id),
        workspaceId=str(ctx.workspace_id),
        slug=str(site.slug),
        name=str(site.name),
        defaultLocale=str(site.default_locale),
        fallbackLocale=str(site.fallback_locale),
        primaryHost=(str(site.primary_host) if site.primary_host else None),
        isActive=bool(site.is_active),
    )
    return Response.success(data=out)


@router.post(
    "/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Issue a preview token for Portal editor/preview (workspace RBAC protected)",
)
async def create_workspace_site_preview_token(
    payload: Annotated[SitePreviewTokenCreateIn, Body(description="Preview token request.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePreviewTokenOut]:
    data = await service.create_preview_token(site_id=site_id, ttl_seconds=payload.ttl_seconds)
    return Response.success(data=data)


@router.get(
    "/settings",
    response_model=ResponseModel[SiteSettingGetOut],
    response_model_exclude_none=True,
    summary="Get a site setting (workspace RBAC protected)",
)
async def get_workspace_site_setting(
    namespace: Annotated[str, Query(..., description="Setting namespace (e.g. theme.config).")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteSettingGetOut]:
    data = await service.get_site_setting(site_id=site_id, namespace=namespace)
    return Response.success(data=data)


@router.put(
    "/settings",
    response_model=ResponseModel[SiteSettingGetOut],
    response_model_exclude_none=True,
    summary="Upsert a site setting (workspace RBAC protected)",
)
async def upsert_workspace_site_setting(
    namespace: Annotated[str, Query(..., description="Setting namespace (e.g. theme.config).")],
    payload: Annotated[SiteSettingUpsertIn, Body(description="Upsert payload.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteSettingGetOut]:
    data = await service.upsert_site_setting(site_id=site_id, namespace=namespace, payload=payload)
    return Response.success(data=data)


@router.get(
    "/pages/tree",
    response_model=ResponseModel[PageData[SitePageTreeNodeOut]],
    response_model_exclude_none=True,
    summary="List pages as a tree (workspace RBAC protected)",
)
async def list_workspace_site_pages_tree(
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[PageData[SitePageTreeNodeOut]]:
    data = await service.list_pages_tree(site_id=site_id)
    return Response.success(data=data)


@router.get(
    "/pages/{page_id}",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Get a page (workspace RBAC protected)",
)
async def get_workspace_site_page(
    page_id: UUID,
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageTreeNodeOut]:
    data = await service.get_page(site_id=site_id, page_id=page_id)
    return Response.success(data=data)


@router.post(
    "/pages",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a page (workspace RBAC protected)",
)
async def create_workspace_site_page(
    payload: Annotated[SitePageCreateIn, Body(description="Create payload.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageTreeNodeOut]:
    data = await service.create_page(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/pages/{page_id}",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Update a page (workspace RBAC protected)",
)
async def update_workspace_site_page(
    page_id: UUID,
    payload: Annotated[SitePageUpdateIn, Body(description="Update payload.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageTreeNodeOut]:
    data = await service.update_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/move",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Move/reorder a page (workspace RBAC protected)",
)
async def move_workspace_site_page(
    page_id: UUID,
    payload: Annotated[SitePageMoveIn, Body(description="Move payload.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageTreeNodeOut]:
    data = await service.move_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/pages/{page_id}",
    response_model=ResponseModel[None],
    response_model_exclude_none=True,
    summary="Delete a page (workspace RBAC protected)",
)
async def delete_workspace_site_page(
    page_id: UUID,
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[None]:
    await service.delete_page(site_id=site_id, page_id=page_id)
    return Response.success(data=None)


@router.get(
    "/pages/{page_id}/revisions/published",
    response_model=ResponseModel[SitePageRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published page revision snapshot (workspace RBAC protected)",
)
async def get_workspace_site_published_page_revision(
    page_id: UUID,
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageRevisionOut]:
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state="published")
    return Response.success(data=data)


@router.get(
    "/pages/{page_id}/revisions/draft",
    response_model=ResponseModel[SitePageRevisionOut],
    response_model_exclude_none=True,
    summary="Get a draft page revision snapshot (workspace RBAC protected)",
)
async def get_workspace_site_draft_page_revision(
    page_id: UUID,
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageRevisionOut]:
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state="draft")
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/revisions/draft",
    response_model=ResponseModel[SitePageDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft page revision (workspace RBAC protected)",
)
async def save_workspace_site_page_draft_revision(
    page_id: UUID,
    payload: Annotated[SitePageDraftSaveIn, Body(description="Page draft save payload.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageDraftSaveOut]:
    data = await service.save_page_draft(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/revisions/publish",
    response_model=ResponseModel[SitePagePublishOut],
    response_model_exclude_none=True,
    summary="Publish a page revision (workspace RBAC protected)",
)
async def publish_workspace_site_page_revision(
    page_id: UUID,
    payload: Annotated[SitePagePublishIn, Body(description="Page publish payload.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePagePublishOut]:
    data = await service.publish_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/revisions/unpublish",
    response_model=ResponseModel[SitePageUnpublishOut],
    response_model_exclude_none=True,
    summary="Unpublish a page (workspace RBAC protected)",
)
async def unpublish_workspace_site_page(
    page_id: UUID,
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageUnpublishOut]:
    data = await service.unpublish_page(site_id=site_id, page_id=page_id)
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/revisions/rollback",
    response_model=ResponseModel[SitePageRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback a page revision pointer (draft or published; workspace RBAC protected)",
)
async def rollback_workspace_site_page_revision(
    page_id: UUID,
    payload: Annotated[SitePageRollbackIn, Body(description="Rollback payload.")],
    site_id: Annotated[str, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageRollbackOut]:
    data = await service.rollback_page_revision(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)
