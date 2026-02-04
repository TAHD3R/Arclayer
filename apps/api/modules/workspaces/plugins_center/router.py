from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import t
from apps.api.modules.system.plugins_manager.service import PluginService
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.modules.workspaces.plugins_center.schema import (
    WorkspacePluginConfigUpdate,
    WorkspacePluginInstallResult,
    WorkspacePluginListOut,
    WorkspacePluginSummary,
)
from apps.api.modules.workspaces.plugins_center.service import WorkspacePluginCenterService
from apps.api.plugin.manager import PluginManager

router = APIRouter(prefix="/workspaces/{workspace_id}/plugins-center", tags=["Workspace: Plugins Center"])


def get_plugin_manager(request: Request) -> PluginManager:
    manager = getattr(request.app.state, "plugin_manager", None)
    if manager is None:
        raise ServiceUnavailable(
            message=t("plugin", "PLUGIN_MANAGER_UNAVAILABLE", default="插件管理器不可用"),
            error="PLUGIN_MANAGER_UNAVAILABLE",
        )
    return manager


def get_plugin_service(
    settings: Settings = Depends(get_settings),
    manager: PluginManager = Depends(get_plugin_manager),
) -> PluginService:
    return PluginService(settings, manager=manager)


def get_center_service(
    settings: Settings = Depends(get_settings),
    plugin_service: PluginService = Depends(get_plugin_service),
) -> WorkspacePluginCenterService:
    return WorkspacePluginCenterService(settings, plugin_service=plugin_service)


@router.get(
    "",
    response_model=ResponseModel[WorkspacePluginListOut],
    summary="List installed plugins with workspace enable state",
    dependencies=[require_workspace_permission("system:plugins:read")],
)
async def list_workspace_plugins(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WorkspacePluginCenterService = Depends(get_center_service),
) -> ResponseModel[WorkspacePluginListOut]:
    items = await service.list_workspace_plugins(workspace_id=ctx.workspace_id)
    return Response.success(data=WorkspacePluginListOut(items=items))


@router.post(
    "/install",
    response_model=ResponseModel[WorkspacePluginInstallResult],
    summary="Install a plugin package (global) and optionally enable in current workspace",
    dependencies=[require_workspace_permission("system:plugins:manage")],
)
async def install_plugin(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    file: UploadFile = File(...),
    checksum: str | None = Form(default=None),
    enable_in_workspace: bool = Form(default=True),
    service: WorkspacePluginCenterService = Depends(get_center_service),
) -> ResponseModel[WorkspacePluginInstallResult]:
    plugin, requires_restart = await service.install_plugin(
        workspace_id=ctx.workspace_id,
        file=file,
        checksum=checksum,
        enable_in_workspace=enable_in_workspace,
    )
    return Response.success(data=WorkspacePluginInstallResult(plugin=plugin, requires_restart=requires_restart))


@router.post(
    "/{plugin_ref}/enable",
    response_model=ResponseModel[WorkspacePluginSummary],
    summary="Enable a plugin in current workspace",
    dependencies=[require_workspace_permission("system:plugins:manage")],
)
async def enable_plugin(
    plugin_ref: str,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    plugin_service: PluginService = Depends(get_plugin_service),
    service: WorkspacePluginCenterService = Depends(get_center_service),
) -> ResponseModel[WorkspacePluginSummary]:
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    out = await service.set_enabled(workspace_id=ctx.workspace_id, plugin_id=plugin_id, enabled=True)
    return Response.success(data=out)


@router.post(
    "/{plugin_ref}/disable",
    response_model=ResponseModel[WorkspacePluginSummary],
    summary="Disable a plugin in current workspace",
    dependencies=[require_workspace_permission("system:plugins:manage")],
)
async def disable_plugin(
    plugin_ref: str,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    plugin_service: PluginService = Depends(get_plugin_service),
    service: WorkspacePluginCenterService = Depends(get_center_service),
) -> ResponseModel[WorkspacePluginSummary]:
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    out = await service.set_enabled(workspace_id=ctx.workspace_id, plugin_id=plugin_id, enabled=False)
    return Response.success(data=out)


@router.post(
    "/{plugin_ref}/uninstall",
    response_model=ResponseModel[None],
    summary="Uninstall a plugin from current workspace (detach only)",
    dependencies=[require_workspace_permission("system:plugins:manage")],
)
async def uninstall_from_workspace(
    plugin_ref: str,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    plugin_service: PluginService = Depends(get_plugin_service),
    service: WorkspacePluginCenterService = Depends(get_center_service),
) -> ResponseModel[None]:
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    await service.uninstall_from_workspace(workspace_id=ctx.workspace_id, plugin_id=plugin_id)
    return Response.success()


@router.post(
    "/{plugin_ref}/reset",
    response_model=ResponseModel[None],
    summary="Reset workspace-scoped plugin config (keep installation)",
    dependencies=[require_workspace_permission("system:plugins:manage")],
)
async def reset_config(
    plugin_ref: str,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    plugin_service: PluginService = Depends(get_plugin_service),
    service: WorkspacePluginCenterService = Depends(get_center_service),
) -> ResponseModel[None]:
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    await service.reset_workspace_config(workspace_id=ctx.workspace_id, plugin_id=plugin_id)
    return Response.success()


@router.put(
    "/{plugin_ref}/config",
    response_model=ResponseModel[WorkspacePluginSummary],
    summary="Update workspace-scoped plugin config",
    dependencies=[require_workspace_permission("system:plugins:manage")],
)
async def update_workspace_config(
    plugin_ref: str,
    body: WorkspacePluginConfigUpdate,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    plugin_service: PluginService = Depends(get_plugin_service),
    service: WorkspacePluginCenterService = Depends(get_center_service),
) -> ResponseModel[WorkspacePluginSummary]:
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    out = await service.update_workspace_config(
        workspace_id=ctx.workspace_id, plugin_id=plugin_id, payload=body.model_dump()
    )
    return Response.success(data=out)
