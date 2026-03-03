from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.http.service import get_site_service
from apps.api.src.modules.sites.schema import (
    SiteEntryTypeCreateIn,
    SiteEntryTypeDeleteOut,
    SiteEntryTypeOut,
    SiteEntryTypeUpdateIn,
)
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.get(
    "/sites/{site_id}/entry-types",
    response_model=ResponseModel[PageData[SiteEntryTypeOut]],
    response_model_exclude_none=True,
    summary="List entry types (preview token required)",
)
async def list_entry_types(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SiteEntryTypeOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_entry_types_paginated(site_id=site_id, params=params)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/entry-types",
    response_model=ResponseModel[SiteEntryTypeOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an entry type (preview token required)",
)
async def create_entry_type(
    site_id: PublicUUID,
    payload: Annotated[SiteEntryTypeCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryTypeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_entry_type(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/entry-types/{entry_type_id}",
    response_model=ResponseModel[SiteEntryTypeOut],
    response_model_exclude_none=True,
    summary="Update an entry type (preview token required)",
)
async def update_entry_type(
    site_id: PublicUUID,
    entry_type_id: PublicUUID,
    payload: Annotated[SiteEntryTypeUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryTypeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_entry_type(site_id=site_id, entry_type_id=entry_type_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/entry-types/{entry_type_id}",
    response_model=ResponseModel[SiteEntryTypeDeleteOut],
    response_model_exclude_none=True,
    summary="Delete an entry type (preview token required)",
)
async def delete_entry_type(
    site_id: PublicUUID,
    entry_type_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteEntryTypeDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)
    return Response.success(data=data)
