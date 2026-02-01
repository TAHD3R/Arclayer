from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import t
from apps.api.core.org.deps import require_org_owner
from apps.api.plugin.manager import PluginManager
from apps.api.routers.v1.system.plugins_manager.schema import (
    PluginConfigUpdate,
    PluginDetail,
    PluginInstallResult,
    PluginSummary,
)
from apps.api.routers.v1.system.plugins_manager.service import PluginService

router = APIRouter(
    tags=["System: Plugins"],
    dependencies=[Depends(require_org_owner)],
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


@router.get("", response_model=ResponseModel[PageData[PluginSummary]])
async def list_plugins(
    params: PageParams = Depends(get_page_params),
    service: PluginService = Depends(get_plugin_service),
) -> ResponseModel[PageData[PluginSummary]]:
    page = await service.list_plugins_paginated(params=params)
    return Response.success(data=page)


@router.get("/{plugin_ref}", response_model=ResponseModel[PluginDetail])
async def get_plugin(
    plugin_ref: str,
    service: PluginService = Depends(get_plugin_service),
) -> ResponseModel[PluginDetail]:
    resolved = service.resolve_plugin_id(plugin_ref)
    record = await service.get_plugin(resolved)
    return Response.success(data=service.to_detail(record))


@router.post("/install", response_model=ResponseModel[PluginInstallResult])
async def install_plugin(
    file: UploadFile = File(...),
    checksum: str | None = Form(default=None),
    enable: bool = Form(default=False),
    service: PluginService = Depends(get_plugin_service),
) -> ResponseModel[PluginInstallResult]:
    record, requires_restart = await service.install_plugin(
        file=file,
        checksum=checksum,
        enable=enable,
    )
    result = PluginInstallResult(plugin=service.to_detail(record), requires_restart=requires_restart)
    return Response.success(data=result)


@router.post("/{plugin_ref}/enable", response_model=ResponseModel[PluginDetail])
async def enable_plugin(
    plugin_ref: str,
    service: PluginService = Depends(get_plugin_service),
) -> ResponseModel[PluginDetail]:
    resolved = service.resolve_plugin_id(plugin_ref)
    record = await service.enable_plugin(resolved)
    return Response.success(data=service.to_detail(record))


@router.post("/{plugin_ref}/disable", response_model=ResponseModel[PluginDetail])
async def disable_plugin(
    plugin_ref: str,
    service: PluginService = Depends(get_plugin_service),
) -> ResponseModel[PluginDetail]:
    resolved = service.resolve_plugin_id(plugin_ref)
    record = await service.disable_plugin(resolved)
    return Response.success(data=service.to_detail(record))


@router.post("/{plugin_ref}/uninstall", response_model=ResponseModel[PluginDetail])
async def uninstall_plugin(
    plugin_ref: str,
    service: PluginService = Depends(get_plugin_service),
) -> ResponseModel[PluginDetail]:
    resolved = service.resolve_plugin_id(plugin_ref)
    record = await service.uninstall_plugin(resolved)
    return Response.success(data=service.to_detail(record))


@router.put("/{plugin_ref}/config", response_model=ResponseModel[PluginInstallResult])
async def update_config(
    plugin_ref: str,
    payload: PluginConfigUpdate,
    service: PluginService = Depends(get_plugin_service),
) -> ResponseModel[PluginInstallResult]:
    resolved = service.resolve_plugin_id(plugin_ref)
    record, requires_restart = await service.update_config(resolved, payload.model_dump())
    result = PluginInstallResult(plugin=service.to_detail(record), requires_restart=requires_restart)
    return Response.success(data=result)
