from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.http.service import get_site_service
from apps.api.src.modules.sites.schema import (
    SitePageCreateIn,
    SitePageDeleteOut,
    SitePageDraftSaveIn,
    SitePageDraftSaveOut,
    SitePageMoveIn,
    SitePagePublishIn,
    SitePagePublishOut,
    SitePageRevisionOut,
    SitePageRollbackIn,
    SitePageRollbackOut,
    SitePageTreeNodeOut,
    SitePageUpdateIn,
)
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.get(
    "/sites/{site_id}/pages",
    response_model=ResponseModel[PageData[SitePageTreeNodeOut]],
    response_model_exclude_none=True,
    summary="List site pages as a tree (preview token required)",
)
async def list_site_pages_tree(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[PageData[SitePageTreeNodeOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_pages_tree(site_id=site_id)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a site page (preview token required)",
)
async def create_site_page(
    site_id: PublicUUID,
    payload: Annotated[SitePageCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageTreeNodeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_page(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/pages/{page_id}",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Update a site page (preview token required)",
)
async def update_site_page(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageTreeNodeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/move",
    response_model=ResponseModel[SitePageTreeNodeOut],
    response_model_exclude_none=True,
    summary="Move/reorder a site page within the tree (preview token required)",
)
async def move_site_page(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageMoveIn, Body(description="Move payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageTreeNodeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.move_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/pages/{page_id}",
    response_model=ResponseModel[SitePageDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a site page (preview token required)",
)
async def delete_site_page(
    site_id: PublicUUID,
    page_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_page(site_id=site_id, page_id=page_id)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/revisions/rollback",
    response_model=ResponseModel[SitePageRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback a page revision pointer (draft or published; preview token required)",
)
async def rollback_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageRollbackIn, Body(description="Rollback payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageRollbackOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.rollback_page_revision(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/pages/{page_id}/revisions/published",
    response_model=ResponseModel[SitePageRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published page revision snapshot",
)
async def get_published_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SitePageRevisionOut]:
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state="published")
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/pages/{page_id}/revisions/draft",
    response_model=ResponseModel[SitePageRevisionOut],
    response_model_exclude_none=True,
    summary="Get a draft page revision snapshot (preview token required)",
)
async def get_draft_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageRevisionOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_page_revision(site_id=site_id, page_id=page_id, state="draft")
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/revisions/draft",
    response_model=ResponseModel[SitePageDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft page revision (preview token required)",
)
async def save_page_revision_draft(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePageDraftSaveIn, Body(description="Page draft save payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePageDraftSaveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.save_page_draft(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/pages/{page_id}/revisions/publish",
    response_model=ResponseModel[SitePagePublishOut],
    response_model_exclude_none=True,
    summary="Publish a page revision (draft -> public; preview token required)",
)
async def publish_page_revision(
    site_id: PublicUUID,
    page_id: PublicUUID,
    payload: Annotated[SitePagePublishIn, Body(description="Page publish payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SitePagePublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.publish_page(site_id=site_id, page_id=page_id, payload=payload)
    return Response.success(data=data)
