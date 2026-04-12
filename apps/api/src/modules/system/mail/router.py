from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import get_current_locale
from src.modules.organization.http.service import require_org_owner
from src.modules.system.mail.schema import MailTestRequest, MailTestResult
from src.modules.system.mail.service import AdminMailService

router = APIRouter(
    tags=["System: Mail"],
    dependencies=[Depends(require_org_owner)],
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
    locale = get_current_locale()
    out = await service.send_test_email(recipient=str(payload.recipient), locale=locale)
    return ApiResponse.success(data=out)
