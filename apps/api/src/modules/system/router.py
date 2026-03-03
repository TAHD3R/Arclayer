from __future__ import annotations

from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request

from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.core.i18n import t
from apps.api.src.modules.analytics.system.router import router as system_activity_router
from apps.api.src.modules.organization.deps import require_org_owner
from apps.api.src.modules.organization.models.org_membership import OrgMembership
from apps.api.src.modules.sys.deps import require_super_admin
from apps.api.src.modules.system.flags import build_system_flags
from apps.api.src.modules.system.mail.router import router as system_mail_router
from apps.api.src.modules.system.plugins_manager.router import router as system_plugins_router
from apps.api.src.modules.system.rbac.router import router as system_rbac_router
from apps.api.src.modules.system.schema import (
    SystemMasterKeyRepairRequest,
    SystemMasterKeyRepairResult,
    SystemReinitializeRequest,
    SystemReinitializeResult,
    SystemRuntimeCapabilities,
    SystemRuntimeOut,
    SystemSetupJobOut,
    SystemSetupJobStatusOut,
    SystemSetupRequest,
    SystemSetupStatus,
)
from apps.api.src.modules.system.service import SystemSetupService
from apps.api.src.modules.system.settings.router import router as system_settings_router
from apps.api.src.plugin.manager import PluginManager

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
    response_model=ResponseModel[SystemSetupJobOut],
    summary="Start system initialization job",
)
async def setup_system(
    request: Request,
    payload: SystemSetupRequest,
    x_setup_token: str | None = Header(default=None, alias="X-Setup-Token"),
    dev_setup: bool = Query(default=False, alias="__dev_setup", include_in_schema=False),
    service: SystemSetupService = Depends(get_setup_service),
) -> ResponseModel[SystemSetupJobOut]:
    host = getattr(getattr(request, "client", None), "host", None)
    service.validate_setup_access(client_host=host, setup_token=x_setup_token)
    job = await service.start_setup_job(payload=payload, dry_run=dev_setup)
    return Response.success(data=job)


@router.get(
    "/setup/jobs/{job_id}",
    response_model=ResponseModel[SystemSetupJobStatusOut],
    summary="Get setup job status",
)
async def get_setup_job_status(
    request: Request,
    job_id: PublicUUID,
    x_setup_token: str | None = Header(default=None, alias="X-Setup-Token"),
    service: SystemSetupService = Depends(get_setup_service),
) -> ResponseModel[SystemSetupJobStatusOut]:
    host = getattr(getattr(request, "client", None), "host", None)
    service.validate_setup_access(client_host=host, setup_token=x_setup_token)
    job = await service.get_setup_job_status(job_id=job_id)
    return Response.success(data=job)


@router.post(
    "/setup/master-key/repair",
    response_model=ResponseModel[SystemMasterKeyRepairResult],
    summary="Repair missing master key",
)
async def repair_setup_master_key(
    payload: SystemMasterKeyRepairRequest,
    user=Depends(require_super_admin),
    service: SystemSetupService = Depends(get_setup_service),
) -> ResponseModel[SystemMasterKeyRepairResult]:
    out = await service.repair_master_key(
        confirm_text=payload.confirm_text,
        password=payload.password.get_secret_value(),
        actor_user_id=getattr(user, "id", None),
        updated_by=getattr(user, "id", None),
    )
    return Response.success(data=out)


@router.post(
    "/setup/reinitialize",
    response_model=ResponseModel[SystemReinitializeResult],
    summary="Reinitialize self-host system",
)
async def reinitialize_self_host_setup(
    payload: SystemReinitializeRequest,
    orgm: OrgMembership = Depends(require_org_owner),
    service: SystemSetupService = Depends(get_setup_service),
) -> ResponseModel[SystemReinitializeResult]:
    out = await service.reinitialize_self_host(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        confirm_name=payload.confirm_name,
    )
    return Response.success(data=out)


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

    from apps.api.src.modules.auth.registration.policy import get_public_register_policy

    deployment_mode = settings.application.deployment_mode
    policy = await get_public_register_policy(settings)
    flags = build_system_flags(settings=settings).model_copy(update={"public_register": policy.enabled})
    return Response.success(
        data=SystemRuntimeOut(
            deployment_mode=deployment_mode,
            capabilities=SystemRuntimeCapabilities(
                deployment_settings_enabled=deployment_mode == "self_host",
                public_register_enabled=policy.enabled,
            ),
            system_flags=flags,
        )
    )


# System-scoped administration endpoints (v2).
# Note: they are placed under `/api/v1/system/*` and guarded by Org owner,
# not the legacy org-scoped RBAC engine.
router.include_router(system_settings_router, prefix="/settings")
router.include_router(system_mail_router, prefix="/mail")
router.include_router(system_plugins_router, prefix="/plugins-manager")
router.include_router(system_rbac_router, prefix="/rbac")
router.include_router(system_activity_router, prefix="/activity")
