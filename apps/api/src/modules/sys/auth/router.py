from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.sys.auth.schema import SysStepUpRequest, SysStepUpResult
from apps.api.src.modules.sys.auth.service import SysAuthService
from apps.api.src.modules.sys.deps import require_super_admin

router = APIRouter(
    tags=["Sys: Auth"],
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
    token, ttl = await service.step_up(user=user, password=payload.password.get_secret_value())
    return Response.success(data=SysStepUpResult(token=token, expires_in=ttl))
