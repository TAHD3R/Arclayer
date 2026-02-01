from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.rbac.service import RBACService
from apps.api.core.workspace.authz import require_workspace_permission
from apps.api.core.workspace.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.routers.v1.system.rbac.schema import PermissionOut, RoleOut

router = APIRouter(prefix="/workspaces/{workspace_id}/rbac", tags=["Workspace RBAC"])


def get_rbac_service(settings: Settings = Depends(get_settings)) -> RBACService:
    return RBACService(settings)


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[RoleOut]],
    summary="List available roles (workspace-scoped read)",
    dependencies=[require_workspace_permission("team:members:read")],
)
async def list_roles(
    params: PageParams = Depends(get_page_params),
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[RoleOut]]:
    page = await service.list_roles_paginated(params=params, out_schema=RoleOut)
    return Response.success(data=PageData[RoleOut].model_validate(page))


@router.get(
    "/permissions",
    response_model=ResponseModel[PageData[PermissionOut]],
    summary="List available permissions (workspace-scoped read)",
    dependencies=[require_workspace_permission("team:members:read")],
)
async def list_permissions(
    params: PageParams = Depends(get_page_params),
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: RBACService = Depends(get_rbac_service),
) -> ResponseModel[PageData[PermissionOut]]:
    page = await service.list_permissions_paginated(params=params, out_schema=PermissionOut)
    return Response.success(data=PageData[PermissionOut].model_validate(page))
