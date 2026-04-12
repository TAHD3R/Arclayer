from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.sys.auth.schema import SysStepUpRequest, SysStepUpResult
from src.modules.sys.auth.service import SysAuthService
from src.modules.sys.http.service import require_super_admin

router = APIRouter(
    tags=["internal.sys.auth"],
    dependencies=[Depends(require_super_admin)],
)


def get_sys_auth_service(settings: Settings = Depends(get_settings)) -> SysAuthService:
    return SysAuthService(settings)


@router.post(
    "/step-up",
    response_model=ResponseModel[SysStepUpResult],
    summary="Issue a sys step-up token (super admin)",
)
async def step_up(
    payload: SysStepUpRequest,
    service: SysAuthService = Depends(get_sys_auth_service),
    user=Depends(require_super_admin),
) -> ResponseModel[SysStepUpResult]:
    """Issue a sys step-up token (super admin)."""
    token, ttl = await service.step_up(user=user, password=payload.password.get_secret_value())
    return ApiResponse.success(data=SysStepUpResult(token=token, expires_in=ttl))
