from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header
from starlette.responses import Response

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response as JsonResponse
from apps.api.core.http.response import ResponseModel
from apps.api.core.organization.deps import get_current_org_id
from apps.api.routers.v1.admin.assets.schema import (
    AdminAssetDeleteOut,
    AdminAssetDetailOut,
    AdminAssetFolderCreateRequest,
    AdminAssetFolderOut,
    AdminAssetFolderUpdateRequest,
    AdminAssetListQuery,
    AdminAssetMoveRequest,
    AdminAssetSummaryOut,
    AdminAssetTagCreateRequest,
    AdminAssetTagOut,
    AdminAssetUpdateRequest,
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


@router.get("/asset-folders", response_model=ResponseModel[PageData[AdminAssetFolderOut]])
async def list_asset_folders(
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetFolderOut]]:
    page = await service.list_folders(org_id=org_id, params=params)
    return JsonResponse.success(data=page)


@router.get("/asset-tags", response_model=ResponseModel[PageData[AdminAssetTagOut]])
async def list_asset_tags(
    q: str | None = None,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetTagOut]]:
    page = await service.list_tags(org_id=org_id, params=params, q=q)
    return JsonResponse.success(data=page)


@router.post("/asset-tags", response_model=ResponseModel[AdminAssetTagOut])
async def create_asset_tag(
    payload: AdminAssetTagCreateRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetTagOut]:
    created = await service.create_tag(org_id=org_id, payload=payload)
    return JsonResponse.success(data=created)


@router.get("/assets/{asset_id}", response_model=ResponseModel[AdminAssetDetailOut])
async def get_asset_detail(
    asset_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    detail = await service.get_asset_detail(org_id=org_id, asset_id=asset_id)
    return JsonResponse.success(data=detail)


@router.patch("/assets/{asset_id}", response_model=ResponseModel[AdminAssetDetailOut])
async def patch_asset(
    asset_id: UUID,
    payload: AdminAssetUpdateRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    updated = await service.update_asset(org_id=org_id, asset_id=asset_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.delete("/assets/{asset_id}", response_model=ResponseModel[AdminAssetDeleteOut])
async def delete_asset(
    asset_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDeleteOut]:
    deleted = await service.delete_asset(org_id=org_id, asset_id=asset_id)
    return JsonResponse.success(data=deleted)


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
