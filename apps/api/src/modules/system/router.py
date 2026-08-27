from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.core.middleware.guard_decorators import guard_rate_limit
from src.modules.analytics.system.router import router as system_activity_router
from src.modules.auth.limits.service import REGISTER_RATE_LIMIT
from src.modules.feedback.system_router import router as system_feedback_router
from src.modules.jobs.platform_router import router as platform_jobs_router
from src.modules.observability.system_router import router as system_observability_router
from src.modules.operational_signals.router import router as operational_signals_router
from src.modules.platform_ai.router import router as platform_ai_operations_router
from src.modules.platform_capabilities.router import router as platform_capabilities_router
from src.modules.platform_identity.management_router import router as platform_identity_management_router
from src.modules.platform_identity.router import router as platform_auth_router
from src.modules.platform_saved_views.router import router as platform_saved_views_router
from src.modules.platform_site_delivery.router import router as platform_site_delivery_router
from src.modules.platform_system_settings.router import router as platform_system_settings_router
from src.modules.support_access.platform_router import router as support_access_platform_router
from src.modules.system.admin.notifications.system_router import router as system_notifications_router
from src.modules.system.agents.router import assignments_router as system_agent_assignments_router
from src.modules.system.agents.router import router as system_agents_router
from src.modules.system.ai_policy.router import router as system_ai_policy_router
from src.modules.system.ai_providers.router import router as system_ai_providers_router
from src.modules.system.directory.router import router as system_directory_router
from src.modules.system.mail.router import router as system_mail_router
from src.modules.system.plugins.router import operations_router as system_plugin_operations_router
from src.modules.system.plugins.router import router as system_plugins_router
from src.modules.system.schema import (
    PlatformBootstrapOut,
    PlatformSetupStateOut,
    SystemBootstrapRequest,
)
from src.modules.system.setup.bootstrap_service import InstanceBootstrapService
from src.modules.system.setup.service import InstanceSetupService
from src.modules.system.skills.router import router as system_skills_router
from src.modules.system.storage_profiles.router import router as system_storage_profiles_router

platform_router = APIRouter(tags=["platform"])


@platform_router.get(
    "/setup/state",
    response_model=ResponseModel[PlatformSetupStateOut],
    summary="Get public Platform setup state",
)
async def get_platform_setup_state(
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformSetupStateOut]:
    """Expose only the Platform bootstrap routing state without Product runtime data."""

    state = await InstanceSetupService(settings).get_state()
    return ApiResponse.success(
        data=PlatformSetupStateOut(
            status=state.status,
            repair_reason=state.repair_reason,
        )
    )


@guard_rate_limit(*REGISTER_RATE_LIMIT)
@platform_router.post(
    "/setup/bootstrap",
    response_model=ResponseModel[PlatformBootstrapOut],
    summary="Bootstrap the initial Instance Owner",
)
async def bootstrap_instance(
    payload: SystemBootstrapRequest,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformBootstrapOut]:
    bootstrap_service = InstanceBootstrapService(settings)
    result = await bootstrap_service.bootstrap_instance(
        username=payload.username,
        password=payload.password,
        email=payload.email,
        display_name=payload.display_name,
    )

    return ApiResponse.success(
        message=t("sys", "INSTANCE_INITIALIZED"),
        data=PlatformBootstrapOut(
            owner_identity_id=result.owner_identity_id,
            mfa_setup_required=True,
        ),
    )


# Platform routes are mounted only by the Platform API composition. Generic
# Settings and tenant-RBAC routers are intentionally absent: Platform authority
# and configuration are owned by exact Platform domains.
platform_router.include_router(platform_auth_router)
platform_router.include_router(platform_capabilities_router)
platform_router.include_router(platform_identity_management_router)
platform_router.include_router(platform_saved_views_router)
platform_router.include_router(system_ai_providers_router, prefix="/ai")
platform_router.include_router(system_ai_policy_router, prefix="/ai")
platform_router.include_router(system_agents_router, prefix="/agents")
platform_router.include_router(system_skills_router, prefix="/skills")
platform_router.include_router(system_agent_assignments_router, prefix="/agent-assignments")
platform_router.include_router(system_storage_profiles_router, prefix="/storage-profiles")
platform_router.include_router(system_directory_router, prefix="/directory")
platform_router.include_router(support_access_platform_router, prefix="/support-access")
platform_router.include_router(system_mail_router, prefix="/communications/email")
platform_router.include_router(system_notifications_router, prefix="/communications")
platform_router.include_router(system_plugins_router, prefix="/extensions")
platform_router.include_router(system_plugin_operations_router, prefix="/extensions/operations")
platform_router.include_router(system_activity_router, prefix="/activity")
platform_router.include_router(platform_ai_operations_router, prefix="/ai-services")
platform_router.include_router(platform_site_delivery_router, prefix="/site-delivery")
platform_router.include_router(platform_system_settings_router, prefix="/settings")
platform_router.include_router(system_feedback_router, prefix="/communications/feedback")
platform_router.include_router(system_observability_router, prefix="/observability")
platform_router.include_router(platform_jobs_router, prefix="/jobs")
platform_router.include_router(operational_signals_router)
