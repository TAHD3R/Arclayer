from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from apps.api.config import Settings, get_settings
from apps.api.core.authz import require_permission_strict
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.core.response import Response, ResponseModel
from apps.api.plugin.manager import PluginManager
from apps.api.routers.v1.admin.plugins.schema import (
    PluginConfigUpdate,
    PluginDetail,
    PluginInstallResult,
    PluginSummary,
)
from apps.api.routers.v1.admin.plugins.service import PluginService
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(
    tags=["Plugins management"],
    dependencies=[require_permission_strict("system:plugins:read")],
)


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


@router.get("", response_model=ResponseModel[list[PluginSummary]])
async def list_plugins(
    service: PluginService = Depends(get_plugin_service),
    _user=Depends(get_current_user),
) -> ResponseModel[list[PluginSummary]]:
    records = await service.list_plugins()
    payload = [service.to_summary(record) for record in records]
    return Response.success(data=payload)


@router.get("/{plugin_id}", response_model=ResponseModel[PluginDetail])
async def get_plugin(
    plugin_id: str,
    service: PluginService = Depends(get_plugin_service),
    _user=Depends(get_current_user),
) -> ResponseModel[PluginDetail]:
    record = await service.get_plugin(plugin_id)
    return Response.success(data=service.to_detail(record))


@router.post("/install", response_model=ResponseModel[PluginInstallResult])
async def install_plugin(
    file: UploadFile = File(...),
    checksum: str | None = Form(default=None),
    enable: bool = Form(default=False),
    service: PluginService = Depends(get_plugin_service),
    _user=Depends(get_current_user),
    _perm=require_permission_strict("system:plugins:manage"),
) -> ResponseModel[PluginInstallResult]:
    record, requires_restart = await service.install_plugin(
        file=file,
        checksum=checksum,
        enable=enable,
    )
    result = PluginInstallResult(plugin=service.to_detail(record), requires_restart=requires_restart)
    return Response.success(data=result)


@router.post("/{plugin_id}/enable", response_model=ResponseModel[PluginDetail])
async def enable_plugin(
    plugin_id: str,
    service: PluginService = Depends(get_plugin_service),
    _user=Depends(get_current_user),
    _perm=require_permission_strict("system:plugins:manage"),
) -> ResponseModel[PluginDetail]:
    record = await service.enable_plugin(plugin_id)
    return Response.success(data=service.to_detail(record))


@router.post("/{plugin_id}/disable", response_model=ResponseModel[PluginDetail])
async def disable_plugin(
    plugin_id: str,
    service: PluginService = Depends(get_plugin_service),
    _user=Depends(get_current_user),
    _perm=require_permission_strict("system:plugins:manage"),
) -> ResponseModel[PluginDetail]:
    record = await service.disable_plugin(plugin_id)
    return Response.success(data=service.to_detail(record))


@router.post("/{plugin_id}/uninstall", response_model=ResponseModel[PluginDetail])
async def uninstall_plugin(
    plugin_id: str,
    service: PluginService = Depends(get_plugin_service),
    _user=Depends(get_current_user),
    _perm=require_permission_strict("system:plugins:manage"),
) -> ResponseModel[PluginDetail]:
    record = await service.uninstall_plugin(plugin_id)
    return Response.success(data=service.to_detail(record))


@router.put("/{plugin_id}/config", response_model=ResponseModel[PluginInstallResult])
async def update_config(
    plugin_id: str,
    payload: PluginConfigUpdate,
    service: PluginService = Depends(get_plugin_service),
    _user=Depends(get_current_user),
    _perm=require_permission_strict("system:plugins:manage"),
) -> ResponseModel[PluginInstallResult]:
    record, requires_restart = await service.update_config(plugin_id, payload.model_dump())
    result = PluginInstallResult(plugin=service.to_detail(record), requires_restart=requires_restart)
    return Response.success(data=result)
