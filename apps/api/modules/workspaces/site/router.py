from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request, status

from apps.api.common.types.public_uuid import PublicUUID
from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.sites.schema import (
    SiteEntryCreateIn,
    SiteEntryDeleteOut,
    SiteEntryDraftSaveIn,
    SiteEntryDraftSaveOut,
    SiteEntryOut,
    SiteEntryPublishIn,
    SiteEntryPublishOut,
    SiteEntryRevisionOut,
    SiteEntryRollbackIn,
    SiteEntryRollbackOut,
    SiteEntryTypeCreateIn,
    SiteEntryTypeDeleteOut,
    SiteEntryTypeOut,
    SiteEntryTypeUpdateIn,
    SiteEntryUnpublishIn,
    SiteEntryUnpublishOut,
    SiteEntryUpdateIn,
    SiteGlobalSectionCreateIn,
    SiteGlobalSectionDeleteOut,
    SiteGlobalSectionOut,
    SiteGlobalSectionsOut,
    SiteGlobalSectionUpdateIn,
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
    SiteStyleOut,
    SiteStyleUpsertIn,
    SiteVisualSitemapOut,
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
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
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
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
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
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteSettingGetOut]:
    data = await service.upsert_site_setting(site_id=site_id, namespace=namespace, payload=payload)
    return Response.success(data=data)


@router.get(
    "/style",
    response_model=ResponseModel[SiteStyleOut],
    response_model_exclude_none=True,
    summary="Get workspace site style payload",
)
async def get_workspace_site_style(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteStyleOut]:
    data = await service.get_site_style(site_id=site_id)
    return Response.success(data=data)


@router.put(
    "/style",
    response_model=ResponseModel[SiteStyleOut],
    response_model_exclude_none=True,
    summary="Upsert workspace site style payload",
)
async def upsert_workspace_site_style(
    payload: Annotated[SiteStyleUpsertIn, Body(description="Style upsert payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteStyleOut]:
    data = await service.upsert_site_style(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/global-sections",
    response_model=ResponseModel[SiteGlobalSectionsOut],
    response_model_exclude_none=True,
    summary="List workspace site global sections",
)
async def list_workspace_site_global_sections(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteGlobalSectionsOut]:
    data = await service.list_global_sections(site_id=site_id)
    return Response.success(data=data)


@router.post(
    "/global-sections",
    response_model=ResponseModel[SiteGlobalSectionOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a workspace site global section",
)
async def create_workspace_site_global_section(
    payload: Annotated[SiteGlobalSectionCreateIn, Body(description="Global section create payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteGlobalSectionOut]:
    data = await service.create_global_section(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/global-sections/{section_id}",
    response_model=ResponseModel[SiteGlobalSectionOut],
    response_model_exclude_none=True,
    summary="Patch a workspace site global section",
)
async def patch_workspace_site_global_section(
    section_id: str,
    payload: Annotated[SiteGlobalSectionUpdateIn, Body(description="Global section patch payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteGlobalSectionOut]:
    data = await service.patch_global_section(site_id=site_id, section_id=section_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/global-sections/{section_id}",
    response_model=ResponseModel[SiteGlobalSectionDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a workspace site global section",
)
async def delete_workspace_site_global_section(
    section_id: str,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteGlobalSectionDeleteOut]:
    data = await service.delete_global_section(site_id=site_id, section_id=section_id)
    return Response.success(data=data)


@router.get(
    "/sitemap/visual",
    response_model=ResponseModel[SiteVisualSitemapOut],
    response_model_exclude_none=True,
    summary="Get workspace site visual sitemap tree",
)
async def get_workspace_site_visual_sitemap(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteVisualSitemapOut]:
    data = await service.get_visual_sitemap(site_id=site_id)
    return Response.success(data=data)


@router.get(
    "/pages/tree",
    response_model=ResponseModel[PageData[SitePageTreeNodeOut]],
    response_model_exclude_none=True,
    summary="List pages as a tree (workspace RBAC protected)",
)
async def list_workspace_site_pages_tree(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
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
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
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
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageTreeNodeOut]:
    data = await service.create_page(site_id=site_id, payload=payload, actor_user_id=user_id)
    return Response.success(data=data)


@router.patch(
    "/pages/{page_id}",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Update a page (workspace RBAC protected)",
)
async def update_workspace_site_page(
    page_id: PublicUUID,
    payload: Annotated[SitePageUpdateIn, Body(description="Update payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageTreeNodeOut]:
    data = await service.update_page(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/move",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Move/reorder a page (workspace RBAC protected)",
)
async def move_workspace_site_page(
    page_id: PublicUUID,
    payload: Annotated[SitePageMoveIn, Body(description="Move payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageTreeNodeOut]:
    data = await service.move_page(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.delete(
    "/pages/{page_id}",
    response_model=ResponseModel[None],
    response_model_exclude_none=True,
    summary="Delete a page (workspace RBAC protected)",
)
async def delete_workspace_site_page(
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
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
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
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
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
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
    page_id: PublicUUID,
    payload: Annotated[SitePageDraftSaveIn, Body(description="Page draft save payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageDraftSaveOut]:
    data = await service.save_page_draft(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/revisions/publish",
    response_model=ResponseModel[SitePagePublishOut],
    response_model_exclude_none=True,
    summary="Publish a page revision (workspace RBAC protected)",
)
async def publish_workspace_site_page_revision(
    page_id: PublicUUID,
    payload: Annotated[SitePagePublishIn, Body(description="Page publish payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePagePublishOut]:
    data = await service.publish_page(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/revisions/unpublish",
    response_model=ResponseModel[SitePageUnpublishOut],
    response_model_exclude_none=True,
    summary="Unpublish a page (workspace RBAC protected)",
)
async def unpublish_workspace_site_page(
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageUnpublishOut]:
    data = await service.unpublish_page(site_id=site_id, page_id=page_id, actor_user_id=user_id)
    return Response.success(data=data)


@router.post(
    "/pages/{page_id}/revisions/rollback",
    response_model=ResponseModel[SitePageRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback a page revision pointer (draft or published; workspace RBAC protected)",
)
async def rollback_workspace_site_page_revision(
    page_id: PublicUUID,
    payload: Annotated[SitePageRollbackIn, Body(description="Rollback payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageRollbackOut]:
    data = await service.rollback_page_revision(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.get(
    "/entry-types",
    response_model=ResponseModel[PageData[SiteEntryTypeOut]],
    response_model_exclude_none=True,
    summary="List entry types (workspace RBAC protected)",
)
async def list_workspace_site_entry_types(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SiteEntryTypeOut]]:
    data = await service.list_entry_types_paginated(site_id=site_id, params=params)
    return Response.success(data=data)


@router.post(
    "/entry-types",
    response_model=ResponseModel[SiteEntryTypeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an entry type (workspace RBAC protected)",
)
async def create_workspace_site_entry_type(
    payload: Annotated[SiteEntryTypeCreateIn, Body(description="Create payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryTypeOut]:
    data = await service.create_entry_type(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/entry-types/{entry_type_id}",
    response_model=ResponseModel[SiteEntryTypeOut],
    response_model_exclude_none=True,
    summary="Update an entry type (workspace RBAC protected)",
)
async def update_workspace_site_entry_type(
    entry_type_id: PublicUUID,
    payload: Annotated[SiteEntryTypeUpdateIn, Body(description="Update payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryTypeOut]:
    data = await service.update_entry_type(site_id=site_id, entry_type_id=entry_type_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/entry-types/{entry_type_id}",
    response_model=ResponseModel[SiteEntryTypeDeleteOut],
    response_model_exclude_none=True,
    summary="Delete an entry type (workspace RBAC protected)",
)
async def delete_workspace_site_entry_type(
    entry_type_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryTypeDeleteOut]:
    data = await service.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)
    return Response.success(data=data)


@router.get(
    "/entries",
    response_model=ResponseModel[PageData[SiteEntryOut]],
    response_model_exclude_none=True,
    summary="List entries (workspace RBAC protected)",
)
async def list_workspace_site_entries(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
    params: PageParams = Depends(get_page_params),
    entry_type_code: Annotated[
        str | None,
        Query(
            alias="entryTypeCode",
            description="Optional entry type code filter (e.g. blog_post).",
        ),
    ] = None,
) -> ResponseModel[PageData[SiteEntryOut]]:
    data = await service.list_entries_paginated(site_id=site_id, params=params, entry_type_code=entry_type_code)
    return Response.success(data=data)


@router.post(
    "/entries",
    response_model=ResponseModel[SiteEntryOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an entry (workspace RBAC protected)",
)
async def create_workspace_site_entry(
    payload: Annotated[SiteEntryCreateIn, Body(description="Create payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryOut]:
    data = await service.create_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/entries/{entry_id}",
    response_model=ResponseModel[SiteEntryOut],
    response_model_exclude_none=True,
    summary="Update an entry (workspace RBAC protected)",
)
async def update_workspace_site_entry(
    entry_id: PublicUUID,
    payload: Annotated[SiteEntryUpdateIn, Body(description="Update payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryOut]:
    data = await service.update_entry(site_id=site_id, entry_id=entry_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/entries/{entry_id}",
    response_model=ResponseModel[SiteEntryDeleteOut],
    response_model_exclude_none=True,
    summary="Delete an entry (must unpublish first; workspace RBAC protected)",
)
async def delete_workspace_site_entry(
    entry_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryDeleteOut]:
    data = await service.delete_entry(site_id=site_id, entry_id=entry_id)
    return Response.success(data=data)


@router.post(
    "/entries/draft",
    response_model=ResponseModel[SiteEntryDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft entry revision (workspace RBAC protected)",
)
async def save_workspace_site_entry_draft(
    payload: Annotated[SiteEntryDraftSaveIn, Body(description="Entry draft save payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryDraftSaveOut]:
    data = await service.save_entry_draft(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/entries/publish",
    response_model=ResponseModel[SiteEntryPublishOut],
    response_model_exclude_none=True,
    summary="Publish an entry (workspace RBAC protected)",
)
async def publish_workspace_site_entry(
    payload: Annotated[SiteEntryPublishIn, Body(description="Entry publish payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryPublishOut]:
    data = await service.publish_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/entries/unpublish",
    response_model=ResponseModel[SiteEntryUnpublishOut],
    response_model_exclude_none=True,
    summary="Unpublish an entry (workspace RBAC protected)",
)
async def unpublish_workspace_site_entry(
    payload: Annotated[SiteEntryUnpublishIn, Body(description="Entry unpublish payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryUnpublishOut]:
    data = await service.unpublish_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/entries/{entry_id}/revisions/rollback",
    response_model=ResponseModel[SiteEntryRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback an entry revision pointer (workspace RBAC protected)",
)
async def rollback_workspace_site_entry_revision(
    entry_id: PublicUUID,
    payload: Annotated[SiteEntryRollbackIn, Body(description="Rollback payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryRollbackOut]:
    data = await service.rollback_entry_revision(site_id=site_id, entry_id=entry_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/entries/{entry_id}/revisions/published",
    response_model=ResponseModel[SiteEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published entry revision snapshot (workspace RBAC protected)",
)
async def get_workspace_site_published_entry_revision(
    entry_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryRevisionOut]:
    data = await service.get_entry_revision(site_id=site_id, entry_id=entry_id, state="published")
    return Response.success(data=data)


@router.get(
    "/entries/{entry_id}/revisions/draft",
    response_model=ResponseModel[SiteEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get a draft entry revision snapshot (workspace RBAC protected)",
)
async def get_workspace_site_draft_entry_revision(
    entry_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryRevisionOut]:
    data = await service.get_entry_revision(site_id=site_id, entry_id=entry_id, state="draft")
    return Response.success(data=data)
