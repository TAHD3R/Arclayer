from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from starlette.responses import Response

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse as JsonResponse
from src.core.http.response import ResponseModel
from src.modules.assets.admin.assets.schema import (
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
    AdminAssetFolderDeleteRequest,
    AdminAssetFolderOut,
    AdminAssetFolderUpdateRequest,
    AdminAssetListQuery,
    AdminAssetMoveRequest,
    AdminAssetSummaryOut,
    AdminAssetTagCreateRequest,
    AdminAssetTagOut,
    AdminAssetUpdateRequest,
)
from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.scope import AssetScope
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["Workspace: Asset Library"],
    dependencies=[require_workspace_permission("system:assets:read")],
)


def get_admin_assets_service(settings: Settings = Depends(get_settings)) -> AdminAssetsService:
    return AdminAssetsService(settings)


def _workspace_scope(ctx: WorkspaceContext) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_WORKSPACE, id=ctx.workspace_id)


@router.get(
    "/assets",
    response_model=ResponseModel[PageData[AdminAssetSummaryOut]],
    summary="List assets",
)
async def list_assets(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    filters: AdminAssetListQuery = Depends(),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetSummaryOut]]:
    page = await service.list_assets(scope=_workspace_scope(ctx), params=params, filters=filters)
    return JsonResponse.success(data=page)


@router.get(
    "/asset-folders",
    response_model=ResponseModel[PageData[AdminAssetFolderOut]],
    summary="List asset folders",
)
async def list_asset_folders(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetFolderOut]]:
    page = await service.list_folders(scope=_workspace_scope(ctx), params=params)
    return JsonResponse.success(data=page)


@router.get(
    "/asset-tags",
    response_model=ResponseModel[PageData[AdminAssetTagOut]],
    summary="List asset tags",
)
async def list_asset_tags(
    q: str | None = None,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetTagOut]]:
    page = await service.list_tags(scope=_workspace_scope(ctx), params=params, q=q)
    return JsonResponse.success(data=page)


@router.post(
    "/asset-tags",
    response_model=ResponseModel[AdminAssetTagOut],
    summary="Create asset tag",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def create_asset_tag(
    payload: AdminAssetTagCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetTagOut]:
    created = await service.create_tag(scope=_workspace_scope(ctx), payload=payload)
    return JsonResponse.success(data=created)


@router.get(
    "/assets/{asset_id}",
    response_model=ResponseModel[AdminAssetDetailOut],
    summary="Get asset detail",
)
async def get_asset_detail(
    asset_id: PublicUUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    detail = await service.get_asset_detail(scope=_workspace_scope(ctx), asset_id=asset_id)
    return JsonResponse.success(data=detail)


@router.patch(
    "/assets/{asset_id}",
    response_model=ResponseModel[AdminAssetDetailOut],
    summary="Update asset",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def patch_asset(
    asset_id: PublicUUID,
    payload: AdminAssetUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    updated = await service.update_asset(scope=_workspace_scope(ctx), asset_id=asset_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.delete(
    "/assets/{asset_id}",
    response_model=ResponseModel[AdminAssetDeleteOut],
    summary="Delete asset",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def delete_asset(
    asset_id: PublicUUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDeleteOut]:
    deleted = await service.delete_asset(scope=_workspace_scope(ctx), asset_id=asset_id)
    return JsonResponse.success(data=deleted)


@router.post(
    "/asset-folders",
    response_model=ResponseModel[AdminAssetFolderOut],
    summary="Create asset folder",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def create_asset_folder(
    payload: AdminAssetFolderCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    created = await service.create_folder(scope=_workspace_scope(ctx), payload=payload)
    return JsonResponse.success(data=created)


@router.put(
    "/asset-folders/{folder_id}",
    response_model=ResponseModel[AdminAssetFolderOut],
    summary="Update asset folder",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def update_asset_folder(
    folder_id: PublicUUID,
    payload: AdminAssetFolderUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    updated = await service.update_folder(scope=_workspace_scope(ctx), folder_id=folder_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.delete(
    "/asset-folders/{folder_id}",
    response_model=ResponseModel[AdminAssetFolderDeleteOut],
    summary="Delete asset folder",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def delete_asset_folder(
    folder_id: PublicUUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderDeleteOut]:
    deleted = await service.delete_folder(scope=_workspace_scope(ctx), folder_id=folder_id)
    return JsonResponse.success(data=deleted)


@router.post(
    "/asset-folders/{folder_id}/delete",
    response_model=ResponseModel[AdminAssetFolderDeleteOut],
    summary="Delete asset folder with content migration",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def delete_asset_folder_with_move(
    folder_id: PublicUUID,
    payload: AdminAssetFolderDeleteRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderDeleteOut]:
    deleted = await service.delete_folder(scope=_workspace_scope(ctx), folder_id=folder_id, payload=payload)
    return JsonResponse.success(data=deleted)


@router.put(
    "/assets/bulk/move",
    response_model=ResponseModel[AdminAssetBulkMoveOut],
    summary="Bulk move assets",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
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

    out = await service.bulk_move_assets(scope=_workspace_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)


@router.post(
    "/assets/bulk/delete",
    response_model=ResponseModel[AdminAssetBulkDeleteOut],
    summary="Bulk delete assets",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
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

    out = await service.bulk_delete_assets(scope=_workspace_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)


@router.put(
    "/assets/bulk/update",
    response_model=ResponseModel[AdminAssetBulkUpdateOut],
    summary="Bulk update assets",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
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

    out = await service.bulk_update_assets(scope=_workspace_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)


@router.put(
    "/assets/{asset_id}/move",
    response_model=ResponseModel[AdminAssetSummaryOut],
    summary="Move asset",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def move_asset(
    asset_id: PublicUUID,
    payload: AdminAssetMoveRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetSummaryOut]:
    updated = await service.move_asset(scope=_workspace_scope(ctx), asset_id=asset_id, payload=payload)
    return JsonResponse.success(data=updated)


@router.get(
    "/assets/{asset_id}/content",
    include_in_schema=False,
    summary="Stream asset content",
)
async def stream_asset_content(
    asset_id: PublicUUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: AdminAssetsService = Depends(get_admin_assets_service),
    range_header: str | None = Header(default=None, alias="Range"),
) -> Response:
    # Binary streaming endpoint for admin preview (supports HTTP Range).
    return await service.stream_asset_content(scope=_workspace_scope(ctx), asset_id=asset_id, range_header=range_header)
