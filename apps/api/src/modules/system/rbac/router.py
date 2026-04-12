from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.organization.http.service import require_org_admin
from src.modules.system.rbac.schema import PermissionOut, PermissionSyncResult
from src.modules.system.rbac.service import RBACService

router = APIRouter(tags=["internal.system.rbac"], dependencies=[Depends(require_org_admin)])


def get_rbac_service(settings: Settings = Depends(get_settings)) -> RBACService:
    return RBACService(settings)


@router.get(
    "/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    summary="List permission catalog (org + workspace)",
)
async def list_permissions(
    params: PageParams = Depends(get_page_params),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[PermissionOut]]:
    """List permission catalog (org + workspace)."""
    perms = await service.repo.list_permissions(scope=None)
    items = [PermissionOut.model_validate(service.localize_permission(p)) for p in perms]
    page = paginate_items(items, params=params)
    return ApiResponse.success(data=page)


@router.post(
    "/permissions/sync",
    response_model=ResponseModel[PermissionSyncResult],
    summary="Sync permission templates into DB and reconcile workspace system role grants",
)
async def sync_permissions(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PermissionSyncResult]:
    """Sync permission templates into DB and reconcile workspace system role grants."""
    result = await service.sync_permissions_with_workspaces()
    return ApiResponse.success(data=result)
