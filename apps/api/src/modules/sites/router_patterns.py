from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.schema import (
    SitePatternCreateIn,
    SitePatternDeleteOut,
    SitePatternOut,
    SitePatternUpdateIn,
)
from apps.api.src.modules.sites.service_patterns import SitePatternService

router = APIRouter(tags=["Site Patterns"])


def get_pattern_service(
    settings: Settings = Depends(get_settings),
) -> SitePatternService:
    return SitePatternService(settings)


@router.get(
    "/sites/{site_id}/patterns",
    response_model=ResponseModel[PageData[SitePatternOut]],
    response_model_exclude_none=True,
    summary="List site patterns (paginated)",
)
async def list_site_patterns(
    site_id: PublicUUID,
    service: Annotated[SitePatternService, Depends(get_pattern_service)],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SitePatternOut]]:
    data = await service.list_patterns(site_id=site_id, params=params)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/patterns",
    response_model=ResponseModel[SitePatternOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a site pattern",
)
async def create_site_pattern(
    site_id: PublicUUID,
    payload: Annotated[SitePatternCreateIn, Body(description="Create payload.")],
    service: Annotated[SitePatternService, Depends(get_pattern_service)],
) -> ResponseModel[SitePatternOut]:
    data = await service.create_pattern(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/patterns/{pattern_id}",
    response_model=ResponseModel[SitePatternOut],
    response_model_exclude_none=True,
    summary="Update a site pattern",
)
async def update_site_pattern(
    site_id: PublicUUID,
    pattern_id: PublicUUID,
    payload: Annotated[SitePatternUpdateIn, Body(description="Update payload.")],
    service: Annotated[SitePatternService, Depends(get_pattern_service)],
) -> ResponseModel[SitePatternOut]:
    data = await service.update_pattern(pattern_id=pattern_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/patterns/{pattern_id}",
    response_model=ResponseModel[SitePatternDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a site pattern",
)
async def delete_site_pattern(
    site_id: PublicUUID,
    pattern_id: PublicUUID,
    service: Annotated[SitePatternService, Depends(get_pattern_service)],
) -> ResponseModel[SitePatternDeleteOut]:
    await service.delete_pattern(pattern_id=pattern_id)
    return Response.success(data=SitePatternDeleteOut(pattern_id=pattern_id))
