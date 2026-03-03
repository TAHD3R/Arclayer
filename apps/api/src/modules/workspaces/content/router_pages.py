from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.sites.schema import (
    SitePageCreateIn as ContentPageCreateIn,
)
from apps.api.src.modules.sites.schema import (
    SitePageDeleteOut as ContentPageDeleteOut,
)
from apps.api.src.modules.sites.schema import (
    SitePageDraftSaveIn as ContentPageDraftSaveIn,
)
from apps.api.src.modules.sites.schema import (
    SitePageDraftSaveOut as ContentPageDraftSaveOut,
)
from apps.api.src.modules.sites.schema import (
    SitePageMoveIn as ContentPageMoveIn,
)
from apps.api.src.modules.sites.schema import (
    SitePagePublishIn as ContentPagePublishIn,
)
from apps.api.src.modules.sites.schema import (
    SitePagePublishOut as ContentPagePublishOut,
)
from apps.api.src.modules.sites.schema import (
    SitePageRevisionOut as ContentPageRevisionOut,
)
from apps.api.src.modules.sites.schema import (
    SitePageRollbackIn as ContentPageRollbackIn,
)
from apps.api.src.modules.sites.schema import (
    SitePageRollbackOut as ContentPageRollbackOut,
)
from apps.api.src.modules.sites.schema import (
    SitePageTreeNodeOut as ContentPageTreeNodeOut,
)
from apps.api.src.modules.sites.schema import (
    SitePageUnpublishOut as ContentPageUnpublishOut,
)
from apps.api.src.modules.sites.schema import (
    SitePageUpdateIn as ContentPageUpdateIn,
)
from apps.api.src.modules.workspaces.content.router_shared import _resolve_site_id, get_workspace_content_service
from apps.api.src.modules.workspaces.content.service import WorkspaceContentService

pages_router = APIRouter(prefix="/pages")


@pages_router.get(
    "/tree",
    response_model=ResponseModel[PageData[ContentPageTreeNodeOut]],
    response_model_exclude_none=True,
    summary="List content pages as a tree (workspace RBAC protected)",
)
async def list_workspace_content_pages_tree(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[PageData[ContentPageTreeNodeOut]]:
    data = await service.list_pages_tree(site_id=site_id)
    return Response.success(data=data)


@pages_router.post(
    "",
    response_model=ResponseModel[ContentPageTreeNodeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a content page (workspace RBAC protected)",
)
async def create_workspace_content_page(
    payload: Annotated[ContentPageCreateIn, Body(description="Create content page payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageTreeNodeOut]:
    data = await service.create_page(
        site_id=site_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@pages_router.get(
    "/{page_id}",
    response_model=ResponseModel[ContentPageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Get a content page (workspace RBAC protected)",
)
async def get_workspace_content_page(
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageTreeNodeOut]:
    data = await service.get_page(site_id=site_id, page_id=page_id)
    return Response.success(data=data)


@pages_router.patch(
    "/{page_id}",
    response_model=ResponseModel[ContentPageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Update a content page (workspace RBAC protected)",
)
async def update_workspace_content_page(
    page_id: PublicUUID,
    payload: Annotated[ContentPageUpdateIn, Body(description="Update content page payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageTreeNodeOut]:
    data = await service.update_page(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@pages_router.delete(
    "/{page_id}",
    response_model=ResponseModel[ContentPageDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a content page (workspace RBAC protected)",
)
async def delete_workspace_content_page(
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageDeleteOut]:
    data = await service.delete_page(site_id=site_id, page_id=page_id)
    return Response.success(data=data)


@pages_router.post(
    "/{page_id}/move",
    response_model=ResponseModel[ContentPageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Move a content page (workspace RBAC protected)",
)
async def move_workspace_content_page(
    page_id: PublicUUID,
    payload: Annotated[ContentPageMoveIn, Body(description="Move content page payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageTreeNodeOut]:
    data = await service.move_page(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@pages_router.get(
    "/{page_id}/revisions/{state}",
    response_model=ResponseModel[ContentPageRevisionOut],
    response_model_exclude_none=True,
    summary="Get content page revision snapshot (workspace RBAC protected)",
)
async def get_workspace_content_page_revision(
    page_id: PublicUUID,
    state: Literal["draft", "published"],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageRevisionOut]:
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state=state)
    return Response.success(data=data)


@pages_router.post(
    "/{page_id}/revisions/draft",
    response_model=ResponseModel[ContentPageDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a content page draft revision (workspace RBAC protected)",
)
async def save_workspace_content_page_draft(
    page_id: PublicUUID,
    payload: Annotated[ContentPageDraftSaveIn, Body(description="Save content page draft payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageDraftSaveOut]:
    data = await service.save_page_draft(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@pages_router.post(
    "/{page_id}/revisions/publish",
    response_model=ResponseModel[ContentPagePublishOut],
    response_model_exclude_none=True,
    summary="Publish a content page revision (workspace RBAC protected)",
)
async def publish_workspace_content_page(
    page_id: PublicUUID,
    payload: Annotated[ContentPagePublishIn, Body(description="Publish content page payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPagePublishOut]:
    data = await service.publish_page(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@pages_router.post(
    "/{page_id}/revisions/unpublish",
    response_model=ResponseModel[ContentPageUnpublishOut],
    response_model_exclude_none=True,
    summary="Unpublish a content page (workspace RBAC protected)",
)
async def unpublish_workspace_content_page(
    page_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageUnpublishOut]:
    data = await service.unpublish_page(
        site_id=site_id,
        page_id=page_id,
        actor_user_id=user_id,
    )
    return Response.success(data=data)


@pages_router.post(
    "/{page_id}/revisions/rollback",
    response_model=ResponseModel[ContentPageRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback content page revision pointer (workspace RBAC protected)",
)
async def rollback_workspace_content_page_revision(
    page_id: PublicUUID,
    payload: Annotated[ContentPageRollbackIn, Body(description="Rollback content page payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceContentService, Depends(get_workspace_content_service)],
) -> ResponseModel[ContentPageRollbackOut]:
    data = await service.rollback_page_revision(
        site_id=site_id,
        page_id=page_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=data)
