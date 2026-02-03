from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header
from starlette.responses import Response

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response as JsonResponse
from apps.api.core.http.response import ResponseModel
from apps.api.modules.assets.admin.assets.schema import (
    AdminAssetBulkDeleteOut,
    AdminAssetBulkDeleteRequest,
    AdminAssetBulkMoveOut,
    AdminAssetBulkMoveRequest,
    AdminAssetBulkUpdateOut,
    AdminAssetBulkUpdateRequest,
    AdminAssetDeleteOut,
    AdminAssetDetailOut,
    AdminAssetFolderCreateRequest,
    AdminAssetFolderDeleteOut,
    AdminAssetFolderOut,
    AdminAssetFolderUpdateRequest,
    AdminAssetListQuery,
    AdminAssetMoveRequest,
    AdminAssetSummaryOut,
    AdminAssetTagCreateRequest,
    AdminAssetTagOut,
    AdminAssetUpdateRequest,
)
from apps.api.modules.assets.admin.assets.service import AdminAssetsService
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["Workspace: Asset Library"],
    dependencies=[require_workspace_permission("admin:access")],
)


def get_admin_assets_service(settings: Settings = Depends(get_settings)) -> AdminAssetsService:
    return AdminAssetsService(settings)


@router.get("/assets", response_model=ResponseModel[PageData[AdminAssetSummaryOut]])
async def list_assets(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    filters: AdminAssetListQuery = Depends(),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetSummaryOut]]:
    page = await service.list_assets(workspace_id=ctx.workspace_id, params=params, filters=filters)
    return JsonResponse.success(data=page)


@router.get("/asset-folders", response_model=ResponseModel[PageData[AdminAssetFolderOut]])
async def list_asset_folders(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetFolderOut]]:
    page = await service.list_folders(workspace_id=ctx.workspace_id, params=params)
    return JsonResponse.success(data=page)


@router.get("/asset-tags", response_model=ResponseModel[PageData[AdminAssetTagOut]])
async def list_asset_tags(
    q: str | None = None,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetTagOut]]:
    page = await service.list_tags(workspace_id=ctx.workspace_id, params=params, q=q)
    return JsonResponse.success(data=page)


@router.post("/asset-tags", response_model=ResponseModel[AdminAssetTagOut])
async def create_asset_tag(
    payload: AdminAssetTagCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetTagOut]:
    created = await service.create_tag(workspace_id=ctx.workspace_id, payload=payload)
    return JsonResponse.success(data=created)


@router.get("/assets/{asset_id}", response_model=ResponseModel[AdminAssetDetailOut])
async def get_asset_detail(
    asset_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    detail = await service.get_asset_detail(workspace_id=ctx.workspace_id, asset_id=asset_id)
    return JsonResponse.success(data=detail)


@router.patch("/assets/{asset_id}", response_model=ResponseModel[AdminAssetDetailOut])
async def patch_asset(
    asset_id: UUID,
    payload: AdminAssetUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    updated = await service.update_asset(workspace_id=ctx.workspace_id, asset_id=asset_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.delete("/assets/{asset_id}", response_model=ResponseModel[AdminAssetDeleteOut])
async def delete_asset(
    asset_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDeleteOut]:
    deleted = await service.delete_asset(workspace_id=ctx.workspace_id, asset_id=asset_id)
    return JsonResponse.success(data=deleted)


@router.post("/asset-folders", response_model=ResponseModel[AdminAssetFolderOut])
async def create_asset_folder(
    payload: AdminAssetFolderCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    created = await service.create_folder(workspace_id=ctx.workspace_id, payload=payload)
    return JsonResponse.success(data=created)


@router.put("/asset-folders/{folder_id}", response_model=ResponseModel[AdminAssetFolderOut])
async def update_asset_folder(
    folder_id: UUID,
    payload: AdminAssetFolderUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    updated = await service.update_folder(workspace_id=ctx.workspace_id, folder_id=folder_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.delete("/asset-folders/{folder_id}", response_model=ResponseModel[AdminAssetFolderDeleteOut])
async def delete_asset_folder(
    folder_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderDeleteOut]:
    deleted = await service.delete_folder(workspace_id=ctx.workspace_id, folder_id=folder_id)
    return JsonResponse.success(data=deleted)


@router.put("/assets/bulk/move", response_model=ResponseModel[AdminAssetBulkMoveOut])
async def bulk_move_assets(
    payload: AdminAssetBulkMoveRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetBulkMoveOut]:
    """
    Bulk move assets to a folder.

    Notes:
    - This is a workspace-scoped operation.
    - folder_id=null means moving to root (unassigned folder).
    """

    out = await service.bulk_move_assets(workspace_id=ctx.workspace_id, payload=payload)
    return JsonResponse.success(data=out)


@router.post("/assets/bulk/delete", response_model=ResponseModel[AdminAssetBulkDeleteOut])
async def bulk_delete_assets(
    payload: AdminAssetBulkDeleteRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetBulkDeleteOut]:
    """
    Bulk soft-delete assets.

    Notes:
    - This sets deleted_at for each asset (soft delete).
    """

    out = await service.bulk_delete_assets(workspace_id=ctx.workspace_id, payload=payload)
    return JsonResponse.success(data=out)


@router.put("/assets/bulk/update", response_model=ResponseModel[AdminAssetBulkUpdateOut])
async def bulk_update_assets(
    payload: AdminAssetBulkUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetBulkUpdateOut]:
    """
    Bulk update assets (currently supports visibility and purpose).

    Notes:
    - This is a workspace-scoped operation.
    - At least one field must be provided (visibility/purpose).
    """

    out = await service.bulk_update_assets(workspace_id=ctx.workspace_id, payload=payload)
    return JsonResponse.success(data=out)


@router.put("/assets/{asset_id}/move", response_model=ResponseModel[AdminAssetSummaryOut])
async def move_asset(
    asset_id: UUID,
    payload: AdminAssetMoveRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetSummaryOut]:
    updated = await service.move_asset(workspace_id=ctx.workspace_id, asset_id=asset_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.get("/assets/{asset_id}/content", include_in_schema=False)
async def stream_asset_content(
    asset_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
    range_header: str | None = Header(default=None, alias="Range"),
) -> Response:
    # Binary streaming endpoint for admin preview (supports HTTP Range).
    return await service.stream_asset_content(
        workspace_id=ctx.workspace_id, asset_id=asset_id, range_header=range_header
    )
