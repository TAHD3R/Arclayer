from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import get_current_locale
from src.core.registries import ConnectorRegistry
from src.modules.auth.http.service import require_super_admin
from src.modules.system.mail.schema import (
    MailProviderInfo,
    MailProviderSwitchRequest,
    MailTemplateCreateRequest,
    MailTemplateOut,
    MailTemplatePatchRequest,
    MailTemplatePreviewOut,
    MailTemplatePreviewRequest,
    MailTestRequest,
    MailTestResult,
)
from src.modules.system.mail.service import AdminMailService
from src.modules.system.mail.template_service import EmailTemplateService

router = APIRouter(
    tags=["internal.system.mail"],
    dependencies=[Depends(require_super_admin)],
)


def get_mail_service(
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> AdminMailService:
    return AdminMailService(settings, connector_registry=connector_registry)


def get_email_template_service() -> EmailTemplateService:
    return EmailTemplateService()


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


@router.get(
    "/templates",
    response_model=ResponseModel[list[MailTemplateOut]],
    summary="List localized email templates",
)
async def list_email_templates(
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[list[MailTemplateOut]]:
    return ApiResponse.success(data=await service.list_templates())


@router.post(
    "/templates",
    response_model=ResponseModel[MailTemplateOut],
    summary="Create a localized email template",
)
async def create_email_template(
    payload: MailTemplateCreateRequest,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[MailTemplateOut]:
    return ApiResponse.success(data=await service.create_template(payload))


@router.patch(
    "/templates/{template_id}",
    response_model=ResponseModel[MailTemplateOut],
    summary="Update a localized email template",
)
async def update_email_template(
    template_id: UUID,
    payload: MailTemplatePatchRequest,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[MailTemplateOut]:
    return ApiResponse.success(data=await service.update_template(template_id, payload))


@router.delete(
    "/templates/{template_id}",
    response_model=ResponseModel[None],
    summary="Delete a localized email template",
)
async def delete_email_template(
    template_id: UUID,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[None]:
    await service.delete_template(template_id)
    return ApiResponse.success(data=None)


@router.post(
    "/templates/preview",
    response_model=ResponseModel[MailTemplatePreviewOut],
    summary="Render an email template preview",
)
async def preview_email_template(
    payload: MailTemplatePreviewRequest,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[MailTemplatePreviewOut]:
    return ApiResponse.success(data=service.preview(payload))
