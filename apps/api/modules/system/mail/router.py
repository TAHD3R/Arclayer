from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import get_current_locale
from apps.api.core.org.deps import require_org_owner
from apps.api.core.system.deps import require_self_host_deployment_mode
from apps.api.modules.system.mail.schema import MailTestRequest, MailTestResult
from apps.api.modules.system.mail.service import AdminMailService

router = APIRouter(
    tags=["System: Mail"],
    dependencies=[Depends(require_self_host_deployment_mode), Depends(require_org_owner)],
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
    return Response.success(data=out)
