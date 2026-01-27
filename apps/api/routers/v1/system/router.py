from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import Forbidden, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.http.response import Response, ResponseModel
from apps.api.plugin.manager import PluginManager
from apps.api.routers.v1.system.schema import SystemSetupRequest, SystemSetupResult
from apps.api.routers.v1.system.service import SystemSetupService

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


def _is_local_request(request: Request) -> bool:
    host = getattr(getattr(request, "client", None), "host", None)
    return host in {"127.0.0.1", "::1", "localhost"}


@router.post("/setup", response_model=ResponseModel[SystemSetupResult])
async def setup_system(
    request: Request,
    payload: SystemSetupRequest,
    x_setup_token: str | None = Header(default=None, alias="X-Setup-Token"),
    settings: Settings = Depends(get_settings),
    service: SystemSetupService = Depends(get_setup_service),
) -> ResponseModel[SystemSetupResult]:
    if not settings.setup.enabled:
        raise ServiceUnavailable(
            message=t("setup", "SETUP_DISABLED", default="系统初始化接口已关闭"),
            error="SETUP_DISABLED",
        )

    expected = settings.setup.token.get_secret_value() if settings.setup.token is not None else ""
    if expected:
        if not x_setup_token or x_setup_token != expected:
            raise Forbidden(
                message=t("setup", "SETUP_TOKEN_INVALID", default="初始化令牌无效"),
                error="SETUP_TOKEN_INVALID",
            )
    else:
        if not _is_local_request(request):
            raise Forbidden(
                message=t("setup", "SETUP_LOCAL_ONLY", default="初始化接口仅允许本机访问"),
                error="SETUP_LOCAL_ONLY",
            )

    admin = payload.admin
    org = payload.organization
    master_key_b64 = payload.master_key.get_secret_value() if payload.master_key is not None else None
    now, fp, user, rbac_ok, organization = await service.setup(
        admin_username=admin.username,
        admin_password=admin.password.get_secret_value(),
        admin_email=admin.email,
        admin_display_name=admin.display_name,
        organization_name=(org.name if org is not None else None),
        organization_slug=(org.slug if org is not None else None),
        organization_logo_url=(org.logo_url if org is not None else None),
        master_key_b64=master_key_b64,
        core_patch=payload.core_patch,
    )
    return Response.success(
        data=SystemSetupResult(
            initialized_at=now,
            master_key_fingerprint=fp,
            admin_user_id=str(user.id),
            admin_username=user.username,
            rbac_bootstrapped=rbac_ok,
            organization_id=(str(organization.id) if organization is not None else None),
            organization_slug=(organization.slug if organization is not None else None),
            organization_name=(organization.name if organization is not None else None),
        )
    )
