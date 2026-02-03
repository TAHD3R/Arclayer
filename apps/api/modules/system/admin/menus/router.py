from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import t
from apps.api.core.workspace.authz import require_workspace_permission
from apps.api.core.workspace.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.system.admin.menus.schema import (
    AdminMenuCreateRequest,
    AdminMenuItemOut,
    AdminMenuListQuery,
    AdminMenuReorderRequest,
    AdminMenuTreeOut,
    AdminMenuUpdateRequest,
)
from apps.api.plugin.extension_points.admin_menu import get_admin_menu_provider

router = APIRouter(
    prefix="/workspaces/{workspace_id}/menus",
    tags=["Workspace: Menu Service"],
    dependencies=[require_workspace_permission("admin:access")],
)


def _require_provider():
    provider = get_admin_menu_provider()
    if provider is None:
        raise ServiceUnavailable(
            message=t("errors", "ADMIN_MENU_PROVIDER_UNAVAILABLE", default="菜单服务不可用"),
            error="ADMIN_MENU_PROVIDER_UNAVAILABLE",
        )
    return provider


@router.get(
    "/me",
    response_model=ResponseModel[AdminMenuTreeOut],
)
async def get_my_menu(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[AdminMenuTreeOut]:
    provider = _require_provider()
    data = await provider.get_menu(user_id=user_id)
    return Response.success(data=data)


@router.get(
    "",
    response_model=ResponseModel[PageData[AdminMenuItemOut]],
    dependencies=[require_workspace_permission("admin:menu:read")],
)
async def list_menu_items(
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    filters: AdminMenuListQuery = Depends(),
) -> ResponseModel[PageData[AdminMenuItemOut]]:
    provider = _require_provider()
    page = await provider.list_items(params=params, filters=filters)
    return Response.success(data=page)


@router.get(
    "/{item_id}",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:read")],
)
async def get_menu_item(
    item_id: UUID,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    provider = _require_provider()
    item = await provider.get_item(item_id=item_id)
    return Response.success(data=item)


@router.post(
    "",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:write")],
)
async def create_menu_item(
    body: AdminMenuCreateRequest,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    provider = _require_provider()
    item = await provider.create_item(payload=body)
    return Response.success(data=item)


@router.patch(
    "/{item_id}",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:write")],
)
async def update_menu_item(
    item_id: UUID,
    body: AdminMenuUpdateRequest,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    provider = _require_provider()
    item = await provider.update_item(item_id=item_id, payload=body)
    return Response.success(data=item)


@router.delete(
    "/{item_id}",
    response_model=ResponseModel[None],
    dependencies=[require_workspace_permission("admin:menu:write")],
)
async def delete_menu_item(
    item_id: UUID,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.delete_item(item_id=item_id)
    return Response.success()


@router.post(
    "/{item_id}/restore",
    response_model=ResponseModel[AdminMenuItemOut],
    dependencies=[require_workspace_permission("admin:menu:write")],
)
async def restore_menu_item(
    item_id: UUID,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[AdminMenuItemOut]:
    provider = _require_provider()
    item = await provider.restore_item(item_id=item_id)
    return Response.success(data=item)


@router.post(
    "/reorder",
    response_model=ResponseModel[None],
    dependencies=[require_workspace_permission("admin:menu:write")],
)
async def reorder_menu_items(
    body: AdminMenuReorderRequest,
    _ctx: WorkspaceContext = Depends(require_workspace_manage_access),
) -> ResponseModel[None]:
    provider = _require_provider()
    await provider.reorder(payload=body)
    return Response.success()
