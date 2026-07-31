from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from starlette.responses import Response

from src.common.constants.assets import ASSET_SCOPE_PROJECT
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
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.projects.http.router_helpers import require_project_commercial_effect, require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context
from src.platform.assets.images import ImageTransformFit, ImageTransformParams

router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.assets"])


def get_admin_assets_service(
    settings: Settings = Depends(get_settings),
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> AdminAssetsService:
    return AdminAssetsService(
        settings,
        resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id),
    )


def _project_scope(ctx: ProjectRequestContext) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_PROJECT, id=ctx.project_id)


@router.get(
    "/assets",
    response_model=ResponseModel[PageData[AdminAssetSummaryOut]],
    summary="List project assets",
    dependencies=[require_project_permission("project:assets:read")],
)
async def list_assets(
    ctx: ProjectRequestContext = Depends(get_project_context),
    params: PageParams = Depends(get_page_params),
    filters: AdminAssetListQuery = Depends(),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetSummaryOut]]:
    page = await service.list_assets(scope=_project_scope(ctx), params=params, filters=filters)
    return JsonResponse.success(data=page)


@router.get(
    "/asset-folders",
    response_model=ResponseModel[PageData[AdminAssetFolderOut]],
    summary="List project asset folders",
    dependencies=[require_project_permission("project:assets:read")],
)
async def list_asset_folders(
    ctx: ProjectRequestContext = Depends(get_project_context),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetFolderOut]]:
    page = await service.list_folders(scope=_project_scope(ctx), params=params)
    return JsonResponse.success(data=page)


@router.get(
    "/asset-tags",
    response_model=ResponseModel[PageData[AdminAssetTagOut]],
    summary="List project asset tags",
    dependencies=[require_project_permission("project:assets:read")],
)
async def list_asset_tags(
    q: str | None = None,
    ctx: ProjectRequestContext = Depends(get_project_context),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[PageData[AdminAssetTagOut]]:
    page = await service.list_tags(scope=_project_scope(ctx), params=params, q=q)
    return JsonResponse.success(data=page)


@router.post(
    "/asset-tags",
    response_model=ResponseModel[AdminAssetTagOut],
    summary="Create project asset tag",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def create_asset_tag(
    payload: AdminAssetTagCreateRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetTagOut]:
    created = await service.create_tag(scope=_project_scope(ctx), payload=payload)
    return JsonResponse.success(data=created)


@router.get(
    "/assets/{asset_id}",
    response_model=ResponseModel[AdminAssetDetailOut],
    summary="Get project asset detail",
    dependencies=[require_project_permission("project:assets:read")],
)
async def get_asset_detail(
    asset_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    detail = await service.get_asset_detail(scope=_project_scope(ctx), asset_id=asset_id)
    return JsonResponse.success(data=detail)


@router.patch(
    "/assets/{asset_id}",
    response_model=ResponseModel[AdminAssetDetailOut],
    summary="Update project asset",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def patch_asset(
    asset_id: PublicUUID,
    payload: AdminAssetUpdateRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDetailOut]:
    updated = await service.update_asset(
        scope=_project_scope(ctx),
        asset_id=asset_id,
        payload=payload,
        actor_user_id=actor_user_id,
    )
    return JsonResponse.success(data=updated)


@router.delete(
    "/assets/{asset_id}",
    response_model=ResponseModel[AdminAssetDeleteOut],
    summary="Delete project asset",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def delete_asset(
    asset_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetDeleteOut]:
    deleted = await service.delete_asset(scope=_project_scope(ctx), asset_id=asset_id, actor_user_id=actor_user_id)
    return JsonResponse.success(data=deleted)


@router.post(
    "/asset-folders",
    response_model=ResponseModel[AdminAssetFolderOut],
    summary="Create project asset folder",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def create_asset_folder(
    payload: AdminAssetFolderCreateRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    created = await service.create_folder(scope=_project_scope(ctx), payload=payload, actor_user_id=actor_user_id)
    return JsonResponse.success(data=created)


@router.put(
    "/asset-folders/{folder_id}",
    response_model=ResponseModel[AdminAssetFolderOut],
    summary="Update project asset folder",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def update_asset_folder(
    folder_id: PublicUUID,
    payload: AdminAssetFolderUpdateRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderOut]:
    updated = await service.update_folder(
        scope=_project_scope(ctx),
        folder_id=folder_id,
        payload=payload,
        actor_user_id=actor_user_id,
    )
    return JsonResponse.success(data=updated)


@router.delete(
    "/asset-folders/{folder_id}",
    response_model=ResponseModel[AdminAssetFolderDeleteOut],
    summary="Delete project asset folder",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def delete_asset_folder(
    folder_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderDeleteOut]:
    deleted = await service.delete_folder(scope=_project_scope(ctx), folder_id=folder_id, actor_user_id=actor_user_id)
    return JsonResponse.success(data=deleted)


@router.post(
    "/asset-folders/{folder_id}/delete",
    response_model=ResponseModel[AdminAssetFolderDeleteOut],
    summary="Delete project asset folder with content migration",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def delete_asset_folder_with_move(
    folder_id: PublicUUID,
    payload: AdminAssetFolderDeleteRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetFolderDeleteOut]:
    deleted = await service.delete_folder(
        scope=_project_scope(ctx),
        folder_id=folder_id,
        payload=payload,
        actor_user_id=actor_user_id,
    )
    return JsonResponse.success(data=deleted)


@router.put(
    "/assets/bulk/move",
    response_model=ResponseModel[AdminAssetBulkMoveOut],
    summary="Bulk move project assets",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def bulk_move_assets(
    payload: AdminAssetBulkMoveRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetBulkMoveOut]:
    out = await service.bulk_move_assets(scope=_project_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)


@router.post(
    "/assets/bulk/delete",
    response_model=ResponseModel[AdminAssetBulkDeleteOut],
    summary="Bulk delete project assets",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def bulk_delete_assets(
    payload: AdminAssetBulkDeleteRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetBulkDeleteOut]:
    out = await service.bulk_delete_assets(scope=_project_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)


@router.put(
    "/assets/bulk/update",
    response_model=ResponseModel[AdminAssetBulkUpdateOut],
    summary="Bulk update project assets",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def bulk_update_assets(
    payload: AdminAssetBulkUpdateRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetBulkUpdateOut]:
    out = await service.bulk_update_assets(scope=_project_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)


@router.put(
    "/assets/{asset_id}/move",
    response_model=ResponseModel[AdminAssetSummaryOut],
    summary="Move project asset",
    dependencies=[
        require_project_permission("project:assets:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def move_asset(
    asset_id: PublicUUID,
    payload: AdminAssetMoveRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    actor_user_id: UUID = Depends(get_current_user_id),
    service: AdminAssetsService = Depends(get_admin_assets_service),
) -> ResponseModel[AdminAssetSummaryOut]:
    updated = await service.move_asset(
        scope=_project_scope(ctx),
        asset_id=asset_id,
        payload=payload,
        actor_user_id=actor_user_id,
    )
    return JsonResponse.success(data=updated)


@router.get(
    "/assets/{asset_id}/content",
    include_in_schema=False,
    summary="Stream project asset content",
    dependencies=[require_project_permission("project:assets:read")],
)
async def stream_asset_content(
    asset_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    service: AdminAssetsService = Depends(get_admin_assets_service),
    w: int | None = Query(default=None, ge=1, le=4096, description="Target image width in pixels."),
    h: int | None = Query(default=None, ge=1, le=4096, description="Target image height in pixels."),
    fit: str = Query(default=ImageTransformFit.SCALE.value, description="Image resize fit mode."),
    fm: str | None = Query(default=None, description="Output image format."),
    q: int | None = Query(default=None, ge=1, le=100, description="Output image quality."),
    range_header: str | None = Header(default=None, alias="Range"),
) -> Response:
    """Stream project asset content."""
    transform = ImageTransformParams(width=w, height=h, fit=fit, format=fm, quality=q).ensure_requested()
    return await service.stream_asset_content(
        scope=_project_scope(ctx),
        asset_id=asset_id,
        range_header=range_header,
        transform=transform,
    )
