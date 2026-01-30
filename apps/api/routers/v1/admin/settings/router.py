from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from apps.api.config import Settings, get_settings
from apps.api.core.authz import require_permission_strict
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import t
from apps.api.plugin.manager import PluginManager
from apps.api.routers.v1.admin.settings.schema import SettingsDetail, SettingsNamespaceSummary, SettingsPatch
from apps.api.routers.v1.admin.settings.service import SettingsService
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(
    tags=["Services: Settings"],
    dependencies=[require_permission_strict("system:settings:read")],
)


def get_plugin_manager(request: Request) -> PluginManager:
    manager = getattr(request.app.state, "plugin_manager", None)
    if manager is None:
        raise ServiceUnavailable(
            message=t("settings", "PLUGIN_MANAGER_UNAVAILABLE", default="插件管理器不可用"),
            error="PLUGIN_MANAGER_UNAVAILABLE",
        )
    return manager


def get_settings_service(
    settings: Settings = Depends(get_settings),
    manager: PluginManager = Depends(get_plugin_manager),
) -> SettingsService:
    return SettingsService(settings, manager=manager)


@router.get("", response_model=ResponseModel[PageData[SettingsNamespaceSummary]])
async def list_namespaces(
    service: SettingsService = Depends(get_settings_service),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SettingsNamespaceSummary]]:
    page = await service.list_namespaces(params=params)
    return Response.success(data=page)


@router.get("/{namespace}", response_model=ResponseModel[SettingsDetail])
async def get_namespace(
    namespace: str,
    service: SettingsService = Depends(get_settings_service),
    _user=Depends(get_current_user),
) -> ResponseModel[SettingsDetail]:
    detail = await service.get_namespace_detail(namespace)
    return Response.success(data=detail)


@router.patch(
    "/{namespace}",
    response_model=ResponseModel[SettingsDetail],
    dependencies=[require_permission_strict("system:settings:manage")],
)
async def patch_namespace(
    namespace: str,
    payload: SettingsPatch,
    service: SettingsService = Depends(get_settings_service),
    user=Depends(get_current_user),
) -> ResponseModel[SettingsDetail]:
    detail = await service.patch_namespace(namespace, patch=payload.patch, updated_by=getattr(user, "id", None))
    return Response.success(data=detail)
