from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.core.i18n import get_current_locale
from apps.api.src.modules.sys.http.service import require_sys_super_admin
from apps.api.src.modules.system.mail.schema import MailTestRequest, MailTestResult
from apps.api.src.modules.system.mail.service import AdminMailService

router = APIRouter(
    tags=["Sys: Mail"],
    dependencies=[Depends(require_sys_super_admin)],
)


def get_mail_service(settings: Settings = Depends(get_settings)) -> AdminMailService:
    return AdminMailService(settings)


@router.post(
    "/test",
    response_model=ResponseModel[MailTestResult],
    summary="Send a test email (super admin)",
)
async def send_test_email(
    payload: MailTestRequest,
    service: AdminMailService = Depends(get_mail_service),
) -> ResponseModel[MailTestResult]:
    locale = get_current_locale()
    out = await service.send_test_email(recipient=str(payload.recipient), locale=locale)
    return Response.success(data=out)
