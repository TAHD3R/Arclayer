from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.http.service import get_site_service
from apps.api.src.modules.sites.schema import (
    SiteRouteTemplateCreateIn,
    SiteRouteTemplateDeleteOut,
    SiteRouteTemplateOut,
    SiteRouteTemplateUpdateIn,
)
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.get(
    "/sites/{site_id}/route-templates",
    response_model=ResponseModel[PageData[SiteRouteTemplateOut]],
    response_model_exclude_none=True,
    summary="List route templates (preview token required)",
)
async def list_site_route_templates(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SiteRouteTemplateOut]]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.list_route_templates_paginated(site_id=site_id, params=params)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/route-templates",
    response_model=ResponseModel[SiteRouteTemplateOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a route template (preview token required)",
)
async def create_site_route_template(
    site_id: PublicUUID,
    payload: Annotated[SiteRouteTemplateCreateIn, Body(description="Create payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteTemplateOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.create_route_template(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.patch(
    "/sites/{site_id}/route-templates/{template_id}",
    response_model=ResponseModel[SiteRouteTemplateOut],
    response_model_exclude_none=True,
    summary="Update a route template (preview token required)",
)
async def update_site_route_template(
    site_id: PublicUUID,
    template_id: PublicUUID,
    payload: Annotated[SiteRouteTemplateUpdateIn, Body(description="Update payload.")],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteTemplateOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.update_route_template(site_id=site_id, template_id=template_id, payload=payload)
    return Response.success(data=data)


@router.delete(
    "/sites/{site_id}/route-templates/{template_id}",
    response_model=ResponseModel[SiteRouteTemplateDeleteOut],
    response_model_exclude_none=True,
    summary="Delete a route template (preview token required)",
)
async def delete_site_route_template(
    site_id: PublicUUID,
    template_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteTemplateDeleteOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.delete_route_template(site_id=site_id, template_id=template_id)
    return Response.success(data=data)
