from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Request

from apps.api.src.common.protocols.tortoise import HasOrganizationId, HasUserId
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.core.i18n import t
from apps.api.src.models.organization.org_membership import OrgMembership
from apps.api.src.modules.organization.http.service import require_org_permission
from apps.api.src.modules.organization.plugins.schema import OrganizationPluginListOut, OrganizationPluginSummary
from apps.api.src.modules.organization.plugins.service import OrganizationPluginService
from apps.api.src.modules.system.plugins.manager.service import PluginService
from apps.api.src.modules.system.settings.schema import SettingsDetail, SettingsPatch
from apps.api.src.plugin.manager import PluginManager

router = APIRouter(
    prefix="/organizations/current/plugins",
    tags=["Organization: Plugins"],
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
    settings: Annotated[Settings, Depends(get_settings)],
    manager: Annotated[PluginManager, Depends(get_plugin_manager)],
) -> PluginService:
    return PluginService(settings, manager=manager)


def get_org_plugin_service(
    settings: Annotated[Settings, Depends(get_settings)],
    plugin_service: Annotated[PluginService, Depends(get_plugin_service)],
) -> OrganizationPluginService:
    return OrganizationPluginService(settings, plugin_service=plugin_service)


@router.get(
    "",
    response_model=ResponseModel[OrganizationPluginListOut],
    summary="List organization-scoped plugins",
)
async def list_org_plugins(
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.extensions.read", error_code="ORG_EXTENSIONS_READ_REQUIRED"),
    ],
    service: Annotated[OrganizationPluginService, Depends(get_org_plugin_service)],
) -> ResponseModel[OrganizationPluginListOut]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    items = await service.list_org_plugins(organization_id=organization_id)
    return Response.success(data=OrganizationPluginListOut(items=items))


@router.post(
    "/{plugin_ref}/enable",
    response_model=ResponseModel[OrganizationPluginSummary],
    summary="Enable an organization-scoped plugin",
)
async def enable_org_plugin(
    plugin_ref: str,
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.extensions.manage", error_code="ORG_EXTENSIONS_MANAGE_REQUIRED"),
    ],
    plugin_service: Annotated[PluginService, Depends(get_plugin_service)],
    service: Annotated[OrganizationPluginService, Depends(get_org_plugin_service)],
) -> ResponseModel[OrganizationPluginSummary]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    out = await service.set_enabled(organization_id=organization_id, plugin_id=plugin_id, enabled=True)
    return Response.success(data=out)


@router.post(
    "/{plugin_ref}/disable",
    response_model=ResponseModel[OrganizationPluginSummary],
    summary="Disable an organization-scoped plugin",
)
async def disable_org_plugin(
    plugin_ref: str,
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.extensions.manage", error_code="ORG_EXTENSIONS_MANAGE_REQUIRED"),
    ],
    plugin_service: Annotated[PluginService, Depends(get_plugin_service)],
    service: Annotated[OrganizationPluginService, Depends(get_org_plugin_service)],
) -> ResponseModel[OrganizationPluginSummary]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    out = await service.set_enabled(organization_id=organization_id, plugin_id=plugin_id, enabled=False)
    return Response.success(data=out)


@router.get(
    "/{plugin_ref}/settings",
    response_model=ResponseModel[SettingsDetail],
    summary="Get organization-scoped plugin settings",
)
async def get_org_plugin_settings(
    plugin_ref: str,
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.extensions.read", error_code="ORG_EXTENSIONS_READ_REQUIRED"),
    ],
    plugin_service: Annotated[PluginService, Depends(get_plugin_service)],
    service: Annotated[OrganizationPluginService, Depends(get_org_plugin_service)],
) -> ResponseModel[SettingsDetail]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    detail = await service.get_plugin_settings_detail(organization_id=organization_id, plugin_id=plugin_id)
    return Response.success(data=detail)


@router.patch(
    "/{plugin_ref}/settings",
    response_model=ResponseModel[SettingsDetail],
    summary="Patch organization-scoped plugin settings",
)
async def patch_org_plugin_settings(
    plugin_ref: str,
    payload: SettingsPatch,
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.extensions.manage", error_code="ORG_EXTENSIONS_MANAGE_REQUIRED"),
    ],
    plugin_service: Annotated[PluginService, Depends(get_plugin_service)],
    service: Annotated[OrganizationPluginService, Depends(get_org_plugin_service)],
) -> ResponseModel[SettingsDetail]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    user_id = UUID(str(cast(HasUserId, orgm).user_id))
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    detail = await service.patch_plugin_settings(
        organization_id=organization_id,
        plugin_id=plugin_id,
        payload=payload,
        updated_by=user_id,
    )
    return Response.success(data=detail)


@router.post(
    "/{plugin_ref}/reset",
    response_model=ResponseModel[None],
    summary="Reset organization-scoped plugin config",
)
async def reset_org_plugin_settings(
    plugin_ref: str,
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.extensions.manage", error_code="ORG_EXTENSIONS_MANAGE_REQUIRED"),
    ],
    plugin_service: Annotated[PluginService, Depends(get_plugin_service)],
    service: Annotated[OrganizationPluginService, Depends(get_org_plugin_service)],
) -> ResponseModel[None]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    await service.reset_plugin_settings(organization_id=organization_id, plugin_id=plugin_id)
    return Response.success()


@router.post(
    "/{plugin_ref}/uninstall",
    response_model=ResponseModel[None],
    summary="Detach organization-scoped plugin and clear org config",
)
async def uninstall_org_plugin(
    plugin_ref: str,
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.extensions.manage", error_code="ORG_EXTENSIONS_MANAGE_REQUIRED"),
    ],
    plugin_service: Annotated[PluginService, Depends(get_plugin_service)],
    service: Annotated[OrganizationPluginService, Depends(get_org_plugin_service)],
) -> ResponseModel[None]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    plugin_id = plugin_service.resolve_plugin_id(plugin_ref)
    await service.uninstall_from_organization(organization_id=organization_id, plugin_id=plugin_id)
    return Response.success()
