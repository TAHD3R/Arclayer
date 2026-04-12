from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Query
from starlette.responses import Response

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.modules.assets.service import AssetsService

router = APIRouter(tags=["external.assets"])


def get_assets_service(settings: Settings = Depends(get_settings)) -> AssetsService:
    return AssetsService(settings)


@router.get("/assets/{asset_id}", include_in_schema=False, summary="Redirect to canonical asset URL")
async def asset_redirect(
    asset_id: PublicUUID,
    service: AssetsService = Depends(get_assets_service),
) -> Response:
    """Redirect to canonical asset URL."""
    return await service.redirect_to_canonical(asset_id=asset_id)


@router.get("/assets/{asset_id}/download", include_in_schema=False, summary="Download asset file")
async def asset_download(
    asset_id: PublicUUID,
    range: str | None = Header(default=None, alias="Range"),
    service: AssetsService = Depends(get_assets_service),
) -> Response:
    """Download asset file."""
    return await service.download(asset_id=asset_id, range_header=range)


@router.get("/assets/{asset_id}/thumb", include_in_schema=False, summary="Serve asset thumbnail")
async def asset_thumbnail(
    asset_id: PublicUUID,
    w: int | None = Query(default=None, ge=1, le=4096, description="Preferred width (px)."),
    range: str | None = Header(default=None, alias="Range"),
    service: AssetsService = Depends(get_assets_service),
) -> Response:
    """Serve asset thumbnail."""
    return await service.thumbnail(asset_id=asset_id, width=w, range_header=range)


@router.get("/assets/{asset_id}/{filename}", include_in_schema=False, summary="Serve asset content")
async def asset_serve(
    asset_id: PublicUUID,
    filename: str,
    range: str | None = Header(default=None, alias="Range"),
    service: AssetsService = Depends(get_assets_service),
) -> Response:
    """Serve asset content."""
    return await service.serve(asset_id=asset_id, filename=filename, range_header=range)
