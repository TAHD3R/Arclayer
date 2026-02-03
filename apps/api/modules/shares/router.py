from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from starlette.responses import Response

from apps.api.config import Settings, get_settings
from apps.api.modules.shares.service import SharesService

router = APIRouter(tags=["Public: Share Links"])


def get_shares_service(settings: Settings = Depends(get_settings)) -> SharesService:
    return SharesService(settings)


@router.get("/s/{token}", include_in_schema=False, summary="Preview shared asset")
async def share_preview(
    token: str,
    range: str | None = Header(default=None, alias="Range"),
    service: SharesService = Depends(get_shares_service),
) -> Response:
    # Inline preview (supports Range for video).
    return await service.preview(token=token, range_header=range)


@router.get("/s/{token}/download", include_in_schema=False, summary="Download shared asset")
async def share_download(
    token: str,
    range: str | None = Header(default=None, alias="Range"),
    service: SharesService = Depends(get_shares_service),
) -> Response:
    return await service.download(token=token, range_header=range)
