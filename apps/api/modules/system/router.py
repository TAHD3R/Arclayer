from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import t
from apps.api.modules.system.mail.router import router as system_mail_router
from apps.api.modules.system.plugins_manager.router import router as system_plugins_router
from apps.api.modules.system.rbac.router import router as system_rbac_router
from apps.api.modules.system.schema import (
    SystemRuntimeCapabilities,
    SystemRuntimeOut,
    SystemSetupRequest,
    SystemSetupResult,
    SystemSetupStatus,
)
from apps.api.modules.system.service import SystemSetupService
from apps.api.modules.system.settings.router import router as system_settings_router
from apps.api.plugin.manager import PluginManager

router = APIRouter(tags=["System: Core Settings"])


def get_plugin_manager(request: Request) -> PluginManager:
    manager = getattr(request.app.state, "plugin_manager", None)
    if manager is None:
        raise ServiceUnavailable(
            message=t("setup", "PLUGIN_MANAGER_UNAVAILABLE", default="插件管理器不可用"),
            error="PLUGIN_MANAGER_UNAVAILABLE",
        )
    return manager


def get_setup_service(
    settings: Settings = Depends(get_settings),
    manager: PluginManager = Depends(get_plugin_manager),
) -> SystemSetupService:
    return SystemSetupService(settings, manager=manager)


@router.get(
    "/setup/status",
    response_model=ResponseModel[SystemSetupStatus],
    summary="Get setup status",
)
async def setup_status(
    service: SystemSetupService = Depends(get_setup_service),
) -> ResponseModel[SystemSetupStatus]:
    """
    Lightweight probe endpoint for admin frontend to decide whether to redirect to /setup.

    Note: This endpoint is intentionally read-only and safe to expose publicly.
    """

    status = await service.get_setup_status()
    return Response.success(data=status)


@router.post(
    "/setup",
    response_model=ResponseModel[SystemSetupResult],
    summary="Initialize system (one-time)",
)
async def setup_system(
    request: Request,
    payload: SystemSetupRequest,
    x_setup_token: str | None = Header(default=None, alias="X-Setup-Token"),
    service: SystemSetupService = Depends(get_setup_service),
) -> ResponseModel[SystemSetupResult]:
    host = getattr(getattr(request, "client", None), "host", None)
    service.validate_setup_access(client_host=host, setup_token=x_setup_token)
    result = await service.run_setup(payload=payload)
    return Response.success(data=result)


@router.get(
    "/runtime",
    response_model=ResponseModel[SystemRuntimeOut],
    summary="Get public runtime deployment capabilities",
)
async def get_system_runtime(
    settings: Settings = Depends(get_settings),
) -> ResponseModel[SystemRuntimeOut]:
    """
    Public, non-sensitive runtime probe endpoint.

    Used by the admin frontend to decide whether instance-level deployment settings
    (e.g. storage/mail) should be exposed in the UI.
    """

    deployment_mode = settings.application.deployment_mode
    return Response.success(
        data=SystemRuntimeOut(
            deployment_mode=deployment_mode,
            capabilities=SystemRuntimeCapabilities(deployment_settings_enabled=deployment_mode == "self_host"),
        )
    )


# System-scoped administration endpoints (v2).
# Note: they are placed under `/api/v1/system/*` and guarded by Org owner,
# not the legacy org-scoped RBAC engine.
router.include_router(system_settings_router, prefix="/settings")
router.include_router(system_mail_router, prefix="/mail")
router.include_router(system_plugins_router, prefix="/plugins-manager")
router.include_router(system_rbac_router, prefix="/rbac")
