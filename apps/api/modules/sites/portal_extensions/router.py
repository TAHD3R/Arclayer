from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import t
from apps.api.infra.cache.valkey import get_valkey
from apps.api.modules.sites.portal_extensions.schema import PortalExtensionsOut
from apps.api.modules.sites.portal_extensions.service import PortalExtensionsService
from apps.api.modules.sites.service import SiteService
from apps.api.plugin.manager import PluginManager

router = APIRouter(tags=["Sites: Portal Extensions"])


def get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)


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
) -> PortalExtensionsService:
    return PortalExtensionsService(settings)


@router.get(
    "/sites/{site_id}/extensions/portal",
    response_model=ResponseModel[PortalExtensionsOut],
    response_model_exclude_none=True,
    summary="List portal extensions declared by enabled plugins (public boundary)",
)
async def list_portal_extensions(
    site_id: str,
    service: Annotated[PortalExtensionsService, Depends(get_service)],
    site_service: Annotated[SiteService, Depends(get_site_service)],
    plugin_manager: Annotated[PluginManager, Depends(get_plugin_manager)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[PortalExtensionsOut]:
    await site_service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
    items = await service.list_portal_extensions_for_site(
        site_id=site_id,
        mode=mode,
        plugin_manager=plugin_manager,
    )
    return Response.success(data=PortalExtensionsOut(items=items))
