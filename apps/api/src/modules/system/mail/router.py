from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.email.service import EmailService
from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import get_current_locale
from src.core.registries import ConnectorRegistry
from src.modules.auth.http.service import require_super_admin
from src.modules.system.mail.schema import (
    MailProviderInfo,
    MailProviderSwitchRequest,
    MailTemplateCategory,
    MailTemplateCreateRequest,
    MailTemplateGroupOut,
    MailTemplateOut,
    MailTemplateOwner,
    MailTemplatePatchRequest,
    MailTemplatePreviewOut,
    MailTemplatePreviewRequest,
    MailTemplateRevisionDetailOut,
    MailTemplateRevisionMutationRequest,
    MailTemplateRevisionOut,
    MailTemplateSourceState,
    MailTemplateTestSendOut,
    MailTemplateTestSendRequest,
    MailTestRequest,
    MailTestResult,
)
from src.modules.system.mail.service import AdminMailService
from src.modules.system.mail.template_repository import EmailTemplateRepository
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


def get_email_template_service(
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> EmailTemplateService:
    return EmailTemplateService(
        EmailTemplateRepository(),
        settings=settings,
        email_sender=EmailService(settings, connector_registry=connector_registry),
    )


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
    response_model=ResponseModel[PageData[MailTemplateGroupOut]],
    summary="List aggregate email template groups",
)
async def list_email_templates(
    service: EmailTemplateService = Depends(get_email_template_service),
    params: PageParams = Depends(get_page_params),
    q: str | None = Query(default=None, description="Search template name, key, description, or subject."),
    ordering: str | None = Query(
        default=None, description="Order by key, name, category, health, version, or updated_at."
    ),
    category: MailTemplateCategory | None = Query(default=None),
    owner: MailTemplateOwner | None = Query(default=None),
    locale: str | None = Query(default=None, pattern=r"^[a-z]{2}(?:-[A-Z]{2})?$"),
    enabled: bool | None = Query(default=None),
    validation_state: str | None = Query(default=None, pattern=r"^(valid|invalid)$"),
    source_state: MailTemplateSourceState | None = Query(default=None),
) -> ResponseModel[PageData[MailTemplateGroupOut]]:
    return ApiResponse.success(
        data=await service.list_templates(
            params=params,
            display_locale=get_current_locale(),
            q=q,
            ordering=ordering,
            category=category,
            owner=owner,
            locale=locale,
            enabled=enabled,
            validation_state=validation_state,
            source_state=source_state,
        )
    )


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


@router.get(
    "/templates/revisions/{revision_id}",
    response_model=ResponseModel[MailTemplateRevisionDetailOut],
    summary="Get an immutable email template revision",
)
async def get_email_template_revision(
    revision_id: UUID,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[MailTemplateRevisionDetailOut]:
    return ApiResponse.success(data=await service.get_revision(revision_id))


@router.get(
    "/templates/{template_key}/history",
    response_model=ResponseModel[PageData[MailTemplateRevisionOut]],
    summary="List locale-aware email template revision history",
)
async def list_email_template_history(
    template_key: str,
    service: EmailTemplateService = Depends(get_email_template_service),
    params: PageParams = Depends(get_page_params),
    locale: str | None = Query(default=None, pattern=r"^[a-z]{2}(?:-[A-Z]{2})?$"),
) -> ResponseModel[PageData[MailTemplateRevisionOut]]:
    return ApiResponse.success(data=await service.list_history(key=template_key, locale=locale, params=params))


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
    expected_version: int = Query(..., ge=1),
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[None]:
    await service.delete_template(template_id, expected_version=expected_version)
    return ApiResponse.success(data=None)


@router.post(
    "/templates/{template_id}/restore-default",
    response_model=ResponseModel[MailTemplateOut],
    summary="Restore a built-in localized email template",
)
async def restore_default_email_template(
    template_id: UUID,
    payload: MailTemplateRevisionMutationRequest,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[MailTemplateOut]:
    return ApiResponse.success(
        data=await service.restore_default(template_id, expected_version=payload.expected_version)
    )


@router.post(
    "/templates/{template_id}/test-send",
    response_model=ResponseModel[MailTemplateTestSendOut],
    summary="Render and send one localized email template through the active provider",
)
async def test_send_email_template(
    template_id: UUID,
    payload: MailTemplateTestSendRequest,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[MailTemplateTestSendOut]:
    return ApiResponse.success(data=await service.send_test(template_id, payload))


@router.get(
    "/templates/{template_id}",
    response_model=ResponseModel[MailTemplateOut],
    summary="Get one localized email template",
)
async def get_email_template(
    template_id: UUID,
    service: EmailTemplateService = Depends(get_email_template_service),
) -> ResponseModel[MailTemplateOut]:
    return ApiResponse.success(data=await service.get_template(template_id))
