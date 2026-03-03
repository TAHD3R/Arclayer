from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.system.admin.menus.schema import (
    AdminMenuCreateRequest,
    AdminMenuItemOut,
    AdminMenuListQuery,
    AdminMenuReorderRequest,
    AdminMenuTreeEffectiveOut,
    AdminMenuTreeOut,
    AdminMenuUpdateRequest,
)
from apps.api.src.modules.system.admin.menus.service import AdminMenuService
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/menus",
    tags=["Workspace: Menu Service"],
    dependencies=[require_workspace_permission("admin:access")],
)


def _get_service() -> AdminMenuService:
    return AdminMenuService()


@router.get(
    "/me",
    response_model=ResponseModel[AdminMenuTreeOut],
    summary="Get current user's admin menu",
)
async def get_my_menu(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[AdminMenuTreeOut]:
    service = _get_service()
    data = await service.get_menu(user_id=user_id)
    return Response.success(data=data)


@router.get(
    "/catalog-effective",
    response_model=ResponseModel[AdminMenuTreeEffectiveOut],
    summary="Get admin menu catalog with per-user access flags (for navigation UI)",
)
async def get_menu_catalog_effective(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[AdminMenuTreeEffectiveOut]:
    service = _get_service()
    data = await service.get_catalog_effective(user_id=user_id)
    return Response.success(data=data)


@router.get(
    "/catalog",
    response_model=ResponseModel[AdminMenuTreeOut],
    summary="Get admin menu catalog (no per-user filtering)",
    dependencies=[require_workspace_permission("rbac:roles:write")],
)
async def get_menu_catalog(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuTreeOut]:
    service = _get_service()
    data = await service.get_catalog()
    return Response.success(data=data)


@router.get(
    "",
    response_model=ResponseModel[PageData[AdminMenuItemOut]],
    dependencies=[require_workspace_permission("admin:menu:read")],
    summary="List admin menu items",
)
async def list_menu_items(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    filters: AdminMenuListQuery = Depends(),
) -> ResponseModel[PageData[AdminMenuItemOut]]:
    service = _get_service()
    page = await service.list_items(params=params, filters=filters)
    return Response.success(data=page)


@router.get(
    "/{item_id}",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:read")],
    summary="Get admin menu item",
)
async def get_menu_item(
    item_id: PublicUUID,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    service = _get_service()
    item = await service.get_item(item_id=item_id)
    return Response.success(data=item)


@router.post(
    "",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:write")],
    summary="Create admin menu item",
)
async def create_menu_item(
    body: AdminMenuCreateRequest,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    service = _get_service()
    item = await service.create_item(payload=body)
    return Response.success(data=item)


@router.patch(
    "/{item_id}",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:write")],
    summary="Update admin menu item",
)
async def update_menu_item(
    item_id: PublicUUID,
    body: AdminMenuUpdateRequest,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    service = _get_service()
    item = await service.update_item(item_id=item_id, payload=body)
    return Response.success(data=item)


@router.delete(
    "/{item_id}",
    response_model=ResponseModel[None],
    dependencies=[require_workspace_permission("admin:menu:write")],
    summary="Delete admin menu item",
)
async def delete_menu_item(
    item_id: PublicUUID,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[None]:
    service = _get_service()
    await service.delete_item(item_id=item_id)
    return Response.success()


@router.post(
    "/{item_id}/restore",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:write")],
    summary="Restore admin menu item",
)
async def restore_menu_item(
    item_id: PublicUUID,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    service = _get_service()
    item = await service.restore_item(item_id=item_id)
    return Response.success(data=item)


@router.post(
    "/reorder",
    response_model=ResponseModel[None],
    dependencies=[require_workspace_permission("admin:menu:write")],
    summary="Reorder admin menu items",
)
async def reorder_menu_items(
    body: AdminMenuReorderRequest,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[None]:
    service = _get_service()
    await service.reorder(payload=body)
    return Response.success()
