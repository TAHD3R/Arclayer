from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import Response, ResponseModel
from src.modules.analytics.system.router import router as system_activity_router
from src.modules.system.flags.service import build_system_flags
from src.modules.system.mail.router import router as system_mail_router
from src.modules.system.rbac.router import router as system_rbac_router
from src.modules.system.schema import SystemRuntimeCapabilities, SystemRuntimeOut
from src.modules.system.settings.router import router as system_settings_router

router = APIRouter(tags=["System: Core Settings"])


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

    from src.modules.auth.registration.service import get_public_register_policy

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
router.include_router(system_rbac_router, prefix="/rbac")
router.include_router(system_activity_router, prefix="/activity")
