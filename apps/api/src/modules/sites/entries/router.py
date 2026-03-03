from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.http.service import get_site_service
from apps.api.src.modules.sites.schema import (
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
    SiteEntryUnpublishIn,
    SiteEntryUnpublishOut,
    SiteEntryUpdateIn,
)
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.post(
    "/sites/{site_id}/entries/draft",
    response_model=ResponseModel[SiteEntryDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft entry revision (v1)",
)
async def save_site_entry_draft(
    site_id: PublicUUID,
    payload: Annotated[
        SiteEntryDraftSaveIn,
        Body(description="Entry draft save payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryDraftSaveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.save_entry_draft(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries/publish",
    response_model=ResponseModel[SiteEntryPublishOut],
    response_model_exclude_none=True,
    summary="Publish an entry (draft -> public)",
)
async def publish_site_entry(
    site_id: PublicUUID,
    payload: Annotated[
        SiteEntryPublishIn,
        Body(description="Entry publish payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryPublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.publish_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries/unpublish",
    response_model=ResponseModel[SiteEntryUnpublishOut],
    response_model_exclude_none=True,
    summary="Unpublish an entry (published -> draft-only)",
)
async def unpublish_site_entry(
    site_id: PublicUUID,
    payload: Annotated[
        SiteEntryUnpublishIn,
        Body(description="Entry unpublish payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryUnpublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.unpublish_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entries",
    response_model=ResponseModel[PageData[SiteEntryOut]],
    response_model_exclude_none=True,
    summary="List entries (preview token required)",
)
async def list_entries(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
    params: PageParams = Depends(get_page_params),
    entry_type_code: Annotated[
        str | None,
        Query(
            alias="entryTypeCode",
            description="Optional entry type code filter (e.g. blog_post).",
        ),
    ] = None,
) -> ResponseModel[PageData[SiteEntryOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_entries_paginated(site_id=site_id, params=params, entry_type_code=entry_type_code)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries",
    response_model=ResponseModel[SiteEntryOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an entry (preview token required)",
)
async def create_entry(
    site_id: PublicUUID,
    payload: Annotated[SiteEntryCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_entry(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/entries/{entry_id}",
    response_model=ResponseModel[SiteEntryOut],
    response_model_exclude_none=True,
    summary="Update an entry (preview token required)",
)
async def update_entry(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    payload: Annotated[SiteEntryUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_entry(site_id=site_id, entry_id=entry_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/entries/{entry_id}",
    response_model=ResponseModel[SiteEntryDeleteOut],
    response_model_exclude_none=True,
    summary="Delete an entry (must unpublish first; preview token required)",
)
async def delete_entry(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_entry(site_id=site_id, entry_id=entry_id)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entries/{entry_id}/revisions/rollback",
    response_model=ResponseModel[SiteEntryRollbackOut],
    response_model_exclude_none=True,
    summary="Rollback an entry revision pointer (draft or published; preview token required)",
)
async def rollback_entry_revision(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    payload: Annotated[SiteEntryRollbackIn, Body(description="Rollback payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryRollbackOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.rollback_entry_revision(site_id=site_id, entry_id=entry_id, payload=payload)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entries/{entry_id}/revisions/published",
    response_model=ResponseModel[SiteEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get a published entry revision snapshot",
)
async def get_published_entry_revision(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteEntryRevisionOut]:
    data = await service.get_entry_revision(site_id=site_id, entry_id=entry_id, state="published")
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/entries/{entry_id}/revisions/draft",
    response_model=ResponseModel[SiteEntryRevisionOut],
    response_model_exclude_none=True,
    summary="Get a draft entry revision snapshot (preview token required)",
)
async def get_draft_entry_revision(
    site_id: PublicUUID,
    entry_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryRevisionOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.get_entry_revision(site_id=site_id, entry_id=entry_id, state="draft")
    return Response.success(data=data)
