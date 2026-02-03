from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.organization.deps import require_org_admin
from apps.api.modules.system.rbac.schema import PermissionOut, PermissionSyncResult
from apps.api.modules.system.rbac.service import RBACService

router = APIRouter(tags=["System: RBAC"], dependencies=[Depends(require_org_admin)])


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
    perms = await service.repo.list_permissions(scope=None)
    items = [PermissionOut.model_validate(service.localize_permission(p)) for p in perms]
    page = paginate_items(items, params=params)
    return Response.success(data=page)


@router.post(
    "/permissions/sync",
    response_model=ResponseModel[PermissionSyncResult],
    summary="Sync permission templates into DB and reconcile workspace system role grants",
)
async def sync_permissions(
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PermissionSyncResult]:
    result = await service.sync_permissions_with_workspaces()
    return Response.success(data=result)
