from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import get_current_locale
from src.modules.auth.http.service import require_super_admin
from src.modules.system.mail.schema import MailProviderInfo, MailProviderSwitchRequest, MailTestRequest, MailTestResult
from src.modules.system.mail.service import AdminMailService

router = APIRouter(
    tags=["internal.system.mail"],
    dependencies=[Depends(require_super_admin)],
)


def get_mail_service(settings: Settings = Depends(get_settings)) -> AdminMailService:
    return AdminMailService(settings)


@router.post(
    "/test",
    response_model=ResponseModel[MailTestResult],
    summary="Send a test email",
)
async def send_test_email(
    payload: MailTestRequest,
    service: AdminMailService = Depends(get_mail_service),
) -> ResponseModel[MailTestResult]:
    """Send a test email."""
    locale = get_current_locale()
    out = await service.send_test_email(recipient=str(payload.recipient), locale=locale)
    return ApiResponse.success(data=out)


@router.get(
    "/providers",
    response_model=ResponseModel[list[MailProviderInfo]],
    summary="List mail providers",
)
async def list_mail_providers(
    service: AdminMailService = Depends(get_mail_service),
) -> ResponseModel[list[MailProviderInfo]]:
    """List configured mail providers."""
    return ApiResponse.success(data=await service.list_providers())


@router.post(
    "/providers/switch",
    response_model=ResponseModel[list[MailProviderInfo]],
    summary="Switch active mail provider",
)
async def switch_mail_provider(
    payload: MailProviderSwitchRequest,
    service: AdminMailService = Depends(get_mail_service),
) -> ResponseModel[list[MailProviderInfo]]:
    """Switch active mail provider."""
    return ApiResponse.success(data=await service.switch_provider(provider=payload.provider))
