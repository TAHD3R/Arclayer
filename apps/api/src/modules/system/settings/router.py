from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from src.config import Settings, get_settings
from src.core.events import EventBus
from src.core.exceptions import ServiceUnavailable
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.modules.auth.http.service import get_current_user
from src.modules.organization.http.service import require_org_owner
from src.modules.system.http.service import require_self_host_deployment_mode
from src.modules.system.settings.schema import SettingsDetail, SettingsNamespaceSummary, SettingsPatch
from src.modules.system.settings.service import SettingsService

router = APIRouter(
    tags=["System: Settings"],
    dependencies=[Depends(require_self_host_deployment_mode), Depends(require_org_owner)],
)


def get_event_bus(request: Request) -> EventBus:
    bus = getattr(request.app.state, "event_bus", None)
    if bus is None:
        raise ServiceUnavailable(
            message=t("settings", "EVENT_BUS_UNAVAILABLE", default="事件总线不可用"),
            error="EVENT_BUS_UNAVAILABLE",
        )
    return bus


def get_settings_service(
    settings: Settings = Depends(get_settings),
    event_bus: EventBus = Depends(get_event_bus),
) -> SettingsService:
    return SettingsService(settings, event_bus=event_bus)


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
    return ApiResponse.success(data=page)


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
    return ApiResponse.success(data=detail)


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
    return ApiResponse.success(data=detail)
