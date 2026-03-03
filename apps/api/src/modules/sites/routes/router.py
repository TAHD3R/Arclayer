from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.http.service import get_site_service
from apps.api.src.modules.sites.routes.schema import (
    SiteRouteDraftSaveIn,
    SiteRouteDraftSaveOut,
    SiteRoutePublishIn,
    SiteRoutePublishOut,
)
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.post(
    "/sites/{site_id}/routes/draft",
    response_model=ResponseModel[SiteRouteDraftSaveOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save a draft page blueprint for a route (stub)",
)
async def save_site_route_draft(
    site_id: PublicUUID,
    payload: Annotated[
        SiteRouteDraftSaveIn,
        Body(description="Draft save payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRouteDraftSaveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.save_route_draft(site_id=site_id, payload=payload)
    return Response.success(data=data)


@router.post(
    "/sites/{site_id}/routes/publish",
    response_model=ResponseModel[SiteRoutePublishOut],
    response_model_exclude_none=True,
    summary="Publish a route (draft -> public)",
)
async def publish_site_route(
    site_id: PublicUUID,
    payload: Annotated[
        SiteRoutePublishIn,
        Body(description="Publish payload."),
    ],
    service: Annotated[SiteService, Depends(get_site_service)],
    token: Annotated[str, Query(..., description="Preview token (required).")],
) -> ResponseModel[SiteRoutePublishOut]:
    await service.assert_preview_access_async(site_id=site_id, mode="preview", token=token)
    data = await service.publish_route(site_id=site_id, payload=payload)
    return Response.success(data=data)
