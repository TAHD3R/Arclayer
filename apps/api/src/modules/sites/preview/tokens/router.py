from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, status

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.core.middleware.guard_decorators import guard_rate_limit
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.sites.http.router_helpers import require_site_commercial_effect
from src.modules.sites.http.service import get_site_service
from src.modules.sites.preview.tokens.schema import SitePreviewTokenCreateIn, SitePreviewTokenOut
from src.modules.sites.service import SiteService

router = APIRouter(tags=["external.sites.preview"])
PREVIEW_TOKEN_CREATE_RATE_LIMIT = (10, 60)


@guard_rate_limit(*PREVIEW_TOKEN_CREATE_RATE_LIMIT)
@router.post(
    "/sites/{site_id}/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a preview token (stub)",
    dependencies=[require_site_commercial_effect(RestrictedRecoveryEffect.ACCESS_EXPANSION)],
)
async def create_preview_token(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
    payload: Annotated[
        SitePreviewTokenCreateIn,
        Body(description="Preview token request."),
    ] = SitePreviewTokenCreateIn(),
) -> ResponseModel[SitePreviewTokenOut]:
    """Create a preview token (stub)."""
    data = await service.create_preview_token(site_id=site_id, ttl_seconds=payload.ttl_seconds)
    return ApiResponse.success(data=data)
