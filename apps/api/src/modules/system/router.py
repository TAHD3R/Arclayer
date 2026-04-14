from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.core.middleware.guard_decorators import guard_rate_limit
from src.modules.analytics.system.router import router as system_activity_router
from src.modules.auth.limits.service import REGISTER_RATE_LIMIT
from src.modules.auth.schema import TokenPair
from src.modules.auth.service import AuthService
from src.modules.auth.sessions.request_context import build_auth_request_context
from src.modules.system.mail.router import router as system_mail_router
from src.modules.system.rbac.router import router as system_rbac_router
from src.modules.system.schema import (
    SystemBootstrapRequest,
    SystemInstanceSetupOut,
    SystemRuntimeCapabilities,
    SystemRuntimeOut,
)
from src.modules.system.settings.router import router as system_settings_router
from src.modules.system.setup.bootstrap_service import InstanceBootstrapService
from src.modules.system.setup.service import InstanceSetupService
from src.platform.cache.valkey import get_valkey

router = APIRouter(tags=["internal.system"])


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
    setup_state = await InstanceSetupService(settings).get_state()
    return ApiResponse.success(
        data=SystemRuntimeOut(
            capabilities=SystemRuntimeCapabilities(
                deployment_settings_enabled=True,
                public_register_enabled=policy.enabled,
            ),
            instance_setup=SystemInstanceSetupOut(
                status=setup_state.status,
                repair_reason=setup_state.repair_reason,
            ),
        )
    )


@guard_rate_limit(*REGISTER_RATE_LIMIT)
@router.post(
    "/setup/bootstrap",
    response_model=ResponseModel[TokenPair],
    summary="Bootstrap an uninitialized instance",
)
async def bootstrap_instance(
    payload: SystemBootstrapRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[TokenPair]:
    bootstrap_service = InstanceBootstrapService(settings)
    result = await bootstrap_service.bootstrap_instance(
        username=payload.username,
        password=payload.password,
        email=payload.email,
        display_name=payload.display_name,
    )

    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    auth_service = AuthService(settings, valkey=valkey)
    tokens = await auth_service.issue_token_pair_for_user(
        result.user_id,
        request_context=build_auth_request_context(request),
        auth_method="bootstrap",
    )
    return ApiResponse.success(message=t("sys", "INSTANCE_INITIALIZED"), data=tokens)


# System-scoped administration endpoints (v2).
# Note: they are placed under `/api/v1/system/*` and guarded by Org owner,
# not the legacy org-scoped RBAC engine.
router.include_router(system_settings_router, prefix="/settings")
router.include_router(system_mail_router, prefix="/mail")
router.include_router(system_rbac_router, prefix="/rbac")
router.include_router(system_activity_router, prefix="/activity")
