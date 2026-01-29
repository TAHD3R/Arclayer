from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header
from starlette.responses import Response

from apps.api.config import Settings, get_settings
from apps.api.core.organization.deps import get_current_org_id
from apps.api.http.pagination import PageData, PageParams, get_page_params
from apps.api.http.response import Response as JsonResponse
from apps.api.http.response import ResponseModel
from apps.api.routers.v1.admin.assets.schema import (
    AdminAssetFolderCreateRequest,
    AdminAssetFolderOut,
    AdminAssetFolderUpdateRequest,
    AdminAssetListQuery,
    AdminAssetMoveRequest,
    AdminAssetSummaryOut,
    AdminAssetTagOut,
)
from apps.api.routers.v1.admin.assets.service import AdminAssetsService
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(tags=["Services: Asset Library"])


def get_admin_assets_service(settings: Settings = Depends(get_settings)) -> AdminAssetsService:
    return AdminAssetsService(settings)


@router.get("/assets", response_model=ResponseModel[PageData[AdminAssetSummaryOut]])
async def list_assets(
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    filters: AdminAssetListQuery = Depends(),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetSummaryOut]]:
    page = await service.list_assets(org_id=org_id, params=params, filters=filters)
    return JsonResponse.success(data=page)


@router.get("/asset-folders", response_model=ResponseModel[list[AdminAssetFolderOut]])
async def list_asset_folders(
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[list[AdminAssetFolderOut]]:
    items = await service.list_folders(org_id=org_id)
    return JsonResponse.success(data=items)


@router.get("/asset-tags", response_model=ResponseModel[list[AdminAssetTagOut]])
async def list_asset_tags(
    q: str | None = None,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[list[AdminAssetTagOut]]:
    items = await service.list_tags(org_id=org_id, q=q)
    return JsonResponse.success(data=items)


@router.post("/asset-folders", response_model=ResponseModel[AdminAssetFolderOut])
async def create_asset_folder(
    payload: AdminAssetFolderCreateRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    created = await service.create_folder(org_id=org_id, payload=payload)
    return JsonResponse.success(data=created)


@router.put("/asset-folders/{folder_id}", response_model=ResponseModel[AdminAssetFolderOut])
async def update_asset_folder(
    folder_id: UUID,
    payload: AdminAssetFolderUpdateRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    updated = await service.update_folder(org_id=org_id, folder_id=folder_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.put("/assets/{asset_id}/move", response_model=ResponseModel[AdminAssetSummaryOut])
async def move_asset(
    asset_id: UUID,
    payload: AdminAssetMoveRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetSummaryOut]:
    updated = await service.move_asset(org_id=org_id, asset_id=asset_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.get("/assets/{asset_id}/content", include_in_schema=False)
async def stream_asset_content(
    asset_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
    range_header: str | None = Header(default=None, alias="Range"),
) -> Response:
    # Binary streaming endpoint for admin preview (supports HTTP Range).
    return await service.stream_asset_content(org_id=org_id, asset_id=asset_id, range_header=range_header)
