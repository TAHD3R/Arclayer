from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.core.i18n import t
from apps.api.src.modules.auth.http.service import get_current_user
from apps.api.src.modules.organization.deps import require_org_owner
from apps.api.src.modules.system.http.service import require_self_host_deployment_mode
from apps.api.src.modules.system.settings.schema import SettingsDetail, SettingsNamespaceSummary, SettingsPatch
from apps.api.src.modules.system.settings.service import SettingsService
from apps.api.src.plugin.manager import PluginManager

router = APIRouter(
    tags=["System: Settings"],
    dependencies=[Depends(require_self_host_deployment_mode), Depends(require_org_owner)],
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


@router.get(
    "",
    response_model=ResponseModel[PageData[SettingsNamespaceSummary]],
    summary="List settings namespaces",
)
async def list_namespaces(
    service: SettingsService = Depends(get_settings_service),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[SettingsNamespaceSummary]]:
    page = await service.list_namespaces(params=params)
    return Response.success(data=page)


@router.get(
    "/{namespace}",
    response_model=ResponseModel[SettingsDetail],
    summary="Get settings namespace detail",
)
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
    summary="Patch settings namespace",
)
async def patch_namespace(
    namespace: str,
    payload: SettingsPatch,
    service: SettingsService = Depends(get_settings_service),
    user=Depends(get_current_user),
) -> ResponseModel[SettingsDetail]:
    detail = await service.patch_namespace(namespace, patch=payload.patch, updated_by=getattr(user, "id", None))
    return Response.success(data=detail)
