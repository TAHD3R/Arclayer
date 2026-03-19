from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.models.content._enums import ContentVersionState
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.content.contracts.schema import ContentItemOut, ContentVersionOut
from apps.api.src.modules.workspaces.content.items.canonical_service import (
    WorkspaceContentCanonicalItemsService,
)
from apps.api.src.modules.workspaces.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemCreateIn,
    ContentVersionDraftSaveIn,
    ContentVersionPatchIn,
)
from apps.api.src.modules.workspaces.content.items.read_service import (
    WorkspaceContentCanonicalItemReadService,
)
from apps.api.src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

canonical_items_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content",
    tags=["Workspace: Content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_workspace_content_canonical_items_service() -> WorkspaceContentCanonicalItemsService:
    return WorkspaceContentCanonicalItemsService(repo=WorkspaceContentItemsRepository())


def get_workspace_content_canonical_item_reads() -> WorkspaceContentCanonicalItemReadService:
    return WorkspaceContentCanonicalItemReadService(repo=WorkspaceContentItemsRepository())


@canonical_items_router.get(
    "/items",
    response_model=ResponseModel[PageData[ContentItemOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content items (workspace RBAC protected)",
)
async def list_workspace_content_items_canonical(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
    params: PageParams = Depends(get_page_params),
    model_key: Annotated[str | None, Query(alias="modelKey", description="Optional content model key filter.")] = None,
) -> ResponseModel[PageData[ContentItemOut]]:
    data = await service.list_items_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
        model_key=model_key,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create rebuilt content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def create_workspace_content_item_canonical(
    payload: Annotated[ContentItemCreateIn, Body(description="Create content item payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.create_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/duplicate",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Duplicate rebuilt content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def duplicate_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.duplicate_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    return Response.success(data=data)


@canonical_items_router.delete(
    "/items/{item_id}",
    response_model=ResponseModel[None],
    summary="Delete rebuilt content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def delete_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[None]:
    await service.delete_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
    )
    return Response.success()


@canonical_items_router.post(
    "/items/{item_id}/archive",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Archive current rebuilt content item state (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def archive_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.archive_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/unarchive",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Restore archived rebuilt content item back to draft (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def unarchive_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.unarchive_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    return Response.success(data=data)


@canonical_items_router.patch(
    "/items/{item_id}/bootstrap-shape",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Apply bootstrap shape to a content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def apply_workspace_content_item_bootstrap_shape(
    item_id: PublicUUID,
    payload: Annotated[
        ContentItemBootstrapShapeIn,
        Body(description="Bootstrap shape payload."),
    ],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.apply_bootstrap_shape(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/draft",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save rebuilt content draft version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def save_workspace_content_item_draft_version_canonical(
    item_id: PublicUUID,
    payload: Annotated[ContentVersionDraftSaveIn, Body(description="Draft save payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.save_draft_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/{version_number}/publish",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Publish rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def publish_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.PUBLISHED,
        actor_user_id=actor_user_id,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/{version_number}/schedule",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Schedule rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def schedule_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.SCHEDULED,
        actor_user_id=actor_user_id,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/{version_number}/archive",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Archive rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def archive_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.ARCHIVED,
        actor_user_id=actor_user_id,
    )
    return Response.success(data=data)


@canonical_items_router.patch(
    "/items/{item_id}/versions/{version_number}",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Patch rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def patch_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    payload: Annotated[ContentVersionPatchIn, Body(description="Version patch payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.patch_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return Response.success(data=data)
