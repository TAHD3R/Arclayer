from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sites.http.service import get_site_service
from apps.api.src.modules.sites.preview_tokens.schema import SitePreviewTokenCreateIn, SitePreviewTokenOut
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.post(
    "/sites/{site_id}/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a preview token (stub)",
)
async def create_preview_token(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    payload: Annotated[
        SitePreviewTokenCreateIn,
        Body(description="Preview token request."),
    ] = SitePreviewTokenCreateIn(),
) -> ResponseModel[SitePreviewTokenOut]:
    data = await service.create_preview_token(site_id=site_id, ttl_seconds=payload.ttl_seconds)
    return Response.success(data=data)
