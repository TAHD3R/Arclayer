from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.authz import require_permission_strict
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import get_current_locale
from apps.api.core.organization.deps import get_current_org_id
from apps.api.routers.v1.admin.mail.schema import MailTestRequest, MailTestResult
from apps.api.routers.v1.admin.mail.service import AdminMailService
from apps.api.routers.v1.auth.deps import get_current_user_id

router = APIRouter(tags=["Services: Mail"])


def get_mail_service(settings: Settings = Depends(get_settings)) -> AdminMailService:
    return AdminMailService(settings)


@router.post(
    "/test",
    response_model=ResponseModel[MailTestResult],
    dependencies=[require_permission_strict("system:settings:manage")],
    summary="Send a test email",
)
async def send_test_email(
    payload: MailTestRequest,
    _org_id: UUID = Depends(get_current_org_id),
    _user_id=Depends(get_current_user_id),
    service: AdminMailService = Depends(get_mail_service),
) -> ResponseModel[MailTestResult]:
    locale = get_current_locale()
    out = await service.send_test_email(recipient=str(payload.recipient), locale=locale)
    return Response.success(data=out)
