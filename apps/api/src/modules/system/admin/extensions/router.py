from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.core.i18n import t
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.system.admin.extensions.schema import AdminUIExtensionListOut
from apps.api.src.modules.system.admin.extensions.service import AdminExtensionsService
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access
from apps.api.src.plugin.manager import PluginManager

router = APIRouter(
    prefix="/workspaces/{workspace_id}/extensions/admin",
    tags=["Workspace: Admin Extensions"],
    dependencies=[
        Depends(require_workspace_manage_access),
        require_workspace_permission("admin:access"),
    ],
)


def get_plugin_manager(request: Request) -> PluginManager:
    manager = getattr(request.app.state, "plugin_manager", None)
    if manager is None:
        raise ServiceUnavailable(
            message=t("plugin", "PLUGIN_MANAGER_UNAVAILABLE", default="插件管理器不可用"),
            error="PLUGIN_MANAGER_UNAVAILABLE",
        )
    return manager


def get_service(
    settings: Settings = Depends(get_settings),
    manager: PluginManager = Depends(get_plugin_manager),
) -> AdminExtensionsService:
    return AdminExtensionsService(settings, plugin_manager=manager)


@router.get(
    "",
    response_model=ResponseModel[AdminUIExtensionListOut],
    summary="List admin UI extensions from enabled plugins",
)
async def list_admin_extensions(
    slot: str | None = None,
    user_id: UUID = Depends(get_current_user_id),
    service: AdminExtensionsService = Depends(get_service),
) -> ResponseModel[AdminUIExtensionListOut]:
    items = await service.list_admin_extensions(user_id=user_id, slot=slot)
    return Response.success(data=AdminUIExtensionListOut(items=items))
