from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header

from apps.api.config import Settings, get_settings
from apps.api.routers.assets.service import AssetsService

router = APIRouter(tags=["Public: Assets"])


def get_assets_service(settings: Settings = Depends(get_settings)) -> AssetsService:
    return AssetsService(settings)


@router.get("/assets/{asset_id}", include_in_schema=False)
async def asset_redirect(
    asset_id: UUID,
    service: AssetsService = Depends(get_assets_service),
):
    return await service.redirect_to_canonical(asset_id=asset_id)


@router.get("/assets/{asset_id}/download", include_in_schema=False)
async def asset_download(
    asset_id: UUID,
    range: str | None = Header(default=None, alias="Range"),
    service: AssetsService = Depends(get_assets_service),
):
    return await service.download(asset_id=asset_id, range_header=range)


@router.get("/assets/{asset_id}/{filename}", include_in_schema=False)
async def asset_serve(
    asset_id: UUID,
    filename: str,
    range: str | None = Header(default=None, alias="Range"),
    service: AssetsService = Depends(get_assets_service),
):
    return await service.serve(asset_id=asset_id, filename=filename, range_header=range)
