from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.src.modules.workspaces.content.router_appearance import appearance_router
from apps.api.src.modules.workspaces.content.router_blocks import blocks_router
from apps.api.src.modules.workspaces.content.router_pages import pages_router
from apps.api.src.modules.workspaces.content.router_shared import _resolve_site_id, get_workspace_content_service
from apps.api.src.modules.workspaces.content.router_structure import structure_router
from apps.api.src.modules.workspaces.content.router_views import views_router
from apps.api.src.modules.workspaces.content.schema import (
    ContentEntryCreateIn,
    ContentEntryDeleteOut,
    ContentEntryDraftSaveIn,
    ContentEntryDraftSaveOut,
    ContentEntryOut,
    ContentEntryPublishIn,
    ContentEntryPublishOut,
    ContentEntryRevisionOut,
    ContentEntryRollbackIn,
    ContentEntryRollbackOut,
    ContentEntryUnpublishOut,
    ContentEntryUpdateIn,
    ContentTypeCreateIn,
    ContentTypeDeleteOut,
    ContentTypeOut,
    ContentTypeUpdateIn,
)
from apps.api.src.modules.workspaces.content.service import WorkspaceContentService
from apps.api.src.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/content",
    tags=["Workspace: Content"],
    dependencies=[require_workspace_permission("admin:access")],
)


@router.get(
    "/types",
    response_model=ResponseModel[PageData[ContentTypeOut]],
    response_model_exclude_none=True,
    summary="List content types (workspace RBAC protected)",
)
async def list_workspace_content_types(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentTypeOut]]:
    data = await service.list_types_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
    )
    return Response.success(data=data)


@router.post(
    "/types",
    response_model=ResponseModel[ContentTypeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content type (workspace RBAC protected)",
)
async def create_workspace_content_type(
    payload: Annotated[ContentTypeCreateIn, Body(description="Create payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentTypeOut]:
    data = await service.create_type(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        payload=payload,
    )
    return Response.success(data=data)


@router.patch(
    "/types/{type_id}",
    response_model=ResponseModel[ContentTypeOut],
    response_model_exclude_none=True,
    summary="Update a content type (workspace RBAC protected)",
)
async def update_workspace_content_type(
    type_id: PublicUUID,
    payload: Annotated[ContentTypeUpdateIn, Body(description="Update payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentTypeOut]:
    data = await service.update_type(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        type_id=type_id,
        payload=payload,
    )
    return Response.success(data=data)


@router.delete(
    "/types/{type_id}",
    response_model=ResponseModel[ContentTypeDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content type (workspace RBAC protected)",
)
async def delete_workspace_content_type(
    type_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentTypeDeleteOut]:
    data = await service.delete_type(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        type_id=type_id,
    )
    return Response.success(data=data)


@router.get(
    "/entries",
    response_model=ResponseModel[PageData[ContentEntryOut]],
    response_model_exclude_none=True,
    summary="List content entries (workspace RBAC protected)",
)
async def list_workspace_content_entries(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
    params: PageParams = Depends(get_page_params),
    type_code: Annotated[str | None, Query(alias="typeCode", description="Optional type code filter.")] = None,
) -> ResponseModel[PageData[ContentEntryOut]]:
    data = await service.list_entries_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
        type_code=type_code,
    )
    return Response.success(data=data)


@router.post(
    "/entries",
    response_model=ResponseModel[ContentEntryOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content entry (workspace RBAC protected)",
)
async def create_workspace_content_entry(
    payload: Annotated[ContentEntryCreateIn, Body(description="Create payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryOut]:
    data = await service.create_entry(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.get(
    "/entries/{entry_id}",
    response_model=ResponseModel[ContentEntryOut],
    response_model_exclude_none=True,
    summary="Get a content entry (workspace RBAC protected)",
)
async def get_workspace_content_entry(
    entry_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryOut]:
    data = await service.get_entry(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
    )
    return Response.success(data=data)


@router.patch(
    "/entries/{entry_id}",
    response_model=ResponseModel[ContentEntryOut],
    response_model_exclude_none=True,
    summary="Update a content entry (workspace RBAC protected)",
)
async def update_workspace_content_entry(
    entry_id: PublicUUID,
    payload: Annotated[ContentEntryUpdateIn, Body(description="Update payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryOut]:
    data = await service.update_entry(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.delete(
    "/entries/{entry_id}",
    response_model=ResponseModel[ContentEntryDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content entry (must unpublish first; workspace RBAC protected)",
)
async def delete_workspace_content_entry(
    entry_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryDeleteOut]:
    data = await service.delete_entry(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
    )
    return Response.success(data=data)


@router.post(
    "/entries/{entry_id}/draft",
    response_model=ResponseModel[ContentEntryDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft entry revision (workspace RBAC protected)",
)
async def save_workspace_content_entry_draft(
    entry_id: PublicUUID,
    payload: Annotated[ContentEntryDraftSaveIn, Body(description="Entry draft save payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryDraftSaveOut]:
    data = await service.save_entry_draft(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.post(
    "/entries/{entry_id}/publish",
    response_model=ResponseModel[ContentEntryPublishOut],
    response_model_exclude_none=True,
    summary="Publish a content entry (workspace RBAC protected)",
)
async def publish_workspace_content_entry(
    entry_id: PublicUUID,
    payload: Annotated[ContentEntryPublishIn, Body(description="Entry publish payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryPublishOut]:
    data = await service.publish_entry(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.post(
    "/entries/{entry_id}/unpublish",
    response_model=ResponseModel[ContentEntryUnpublishOut],
    response_model_exclude_none=True,
    summary="Unpublish a content entry (workspace RBAC protected)",
)
async def unpublish_workspace_content_entry(
    entry_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryUnpublishOut]:
    data = await service.unpublish_entry(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@router.get(
    "/entries/{entry_id}/revisions/{state}",
    response_model=ResponseModel[ContentEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get content entry revision snapshot (workspace RBAC protected)",
)
async def get_workspace_content_entry_revision(
    entry_id: PublicUUID,
    state: Literal["draft", "published"],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryRevisionOut]:
    data = await service.get_entry_revision(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
        state=state,
    )
    return Response.success(data=data)


@router.post(
    "/entries/{entry_id}/revisions/rollback",
    response_model=ResponseModel[ContentEntryRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback content entry revision pointer (workspace RBAC protected)",
)
async def rollback_workspace_content_entry_revision(
    entry_id: PublicUUID,
    payload: Annotated[ContentEntryRollbackIn, Body(description="Rollback payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentEntryRollbackOut]:
    data = await service.rollback_entry_revision(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        entry_id=entry_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


router.include_router(pages_router)
router.include_router(structure_router)
router.include_router(blocks_router)
router.include_router(views_router)
router.include_router(appearance_router)
