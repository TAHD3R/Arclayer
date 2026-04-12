from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.analytics.system.router import router as system_activity_router
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

    Used by the admin frontend to read public, non-sensitive runtime capabilities.
    """

    from src.modules.auth.registration.service import get_public_register_policy

    policy = await get_public_register_policy(settings)
    return ApiResponse.success(
        data=SystemRuntimeOut(
            capabilities=SystemRuntimeCapabilities(
                deployment_settings_enabled=True,
                public_register_enabled=policy.enabled,
            ),
        )
    )


# System-scoped administration endpoints (v2).
# Note: they are placed under `/api/v1/system/*` and guarded by Org owner,
# not the legacy org-scoped RBAC engine.
router.include_router(system_settings_router, prefix="/settings")
router.include_router(system_mail_router, prefix="/mail")
router.include_router(system_rbac_router, prefix="/rbac")
router.include_router(system_activity_router, prefix="/activity")
