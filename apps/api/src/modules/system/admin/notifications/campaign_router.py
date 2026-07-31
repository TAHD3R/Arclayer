from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.models.system.notification_campaign import NotificationCampaignState, NotificationDeliveryState
from src.modules.jobs.service import BackgroundJobService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.admin.notifications.campaign_assets import NotificationCampaignAssetRepository
from src.modules.system.admin.notifications.campaign_contracts import (
    NotificationCampaignCreateRequest,
    NotificationCampaignPatchRequest,
    NotificationCampaignPublishRequest,
    NotificationCampaignRevisionRequest,
)
from src.modules.system.admin.notifications.campaign_mutation_service import (
    NotificationCampaignMutationService,
)
from src.modules.system.admin.notifications.campaign_query_service import NotificationCampaignQueryService
from src.modules.system.admin.notifications.campaign_repository import NotificationCampaignRepository
from src.modules.system.admin.notifications.campaign_schema import (
    NotificationAudienceEstimateOut,
    NotificationCampaignCancellationOut,
    NotificationCampaignDetailOut,
    NotificationCampaignPreviewOut,
    NotificationCampaignPublishOut,
    NotificationCampaignRetryOut,
    NotificationCampaignSummaryOut,
    NotificationDeliveryOut,
)
from src.modules.system.admin.notifications.campaign_validation import (
    NotificationCampaignEmailTemplateRepository,
)

router = APIRouter()


def get_campaign_query_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> NotificationCampaignQueryService:
    return NotificationCampaignQueryService(NotificationCampaignRepository(), settings=settings)


def get_campaign_mutation_service(
    settings: Annotated[Settings, Depends(get_settings)],
    connector_registry: Annotated[ConnectorRegistry, Depends(get_connector_registry)],
) -> NotificationCampaignMutationService:
    repository = NotificationCampaignRepository()
    query = NotificationCampaignQueryService(repository, settings=settings)
    return NotificationCampaignMutationService(
        repository,
        query=query,
        jobs=BackgroundJobService(settings),
        assets=NotificationCampaignAssetRepository(),
        templates=NotificationCampaignEmailTemplateRepository(),
        settings=settings,
    )


@router.get(
    "/campaigns",
    response_model=ResponseModel[PageData[NotificationCampaignSummaryOut]],
    summary="List notification campaigns",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ)],
)
async def list_notification_campaigns(
    service: Annotated[NotificationCampaignQueryService, Depends(get_campaign_query_service)],
    params: Annotated[PageParams, Depends(get_page_params)],
    q: str | None = Query(default=None),
    ordering: str | None = Query(default=None),
    state: list[NotificationCampaignState] = Query(default=[]),
) -> ResponseModel[PageData[NotificationCampaignSummaryOut]]:
    return ApiResponse.success(
        data=await service.list_campaigns(
            params=params,
            q=q,
            ordering=ordering,
            states=tuple(state),
        )
    )


@router.post(
    "/campaigns",
    response_model=ResponseModel[NotificationCampaignDetailOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a notification campaign draft",
)
async def create_notification_campaign(
    payload: NotificationCampaignCreateRequest,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_MANAGE)
    ],
    service: Annotated[NotificationCampaignMutationService, Depends(get_campaign_mutation_service)],
) -> ResponseModel[NotificationCampaignDetailOut]:
    return ApiResponse.success(data=await service.create_campaign(payload=payload, actor_user_id=actor.actor_id))


@router.get(
    "/campaigns/{campaign_id}",
    response_model=ResponseModel[NotificationCampaignDetailOut],
    summary="Get a notification campaign",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ)],
)
async def get_notification_campaign(
    campaign_id: PublicUUID,
    service: Annotated[NotificationCampaignQueryService, Depends(get_campaign_query_service)],
) -> ResponseModel[NotificationCampaignDetailOut]:
    return ApiResponse.success(data=await service.get_campaign(campaign_id))


@router.patch(
    "/campaigns/{campaign_id}",
    response_model=ResponseModel[NotificationCampaignDetailOut],
    summary="Revision-update a notification campaign draft",
)
async def update_notification_campaign(
    campaign_id: PublicUUID,
    payload: NotificationCampaignPatchRequest,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_MANAGE)
    ],
    service: Annotated[NotificationCampaignMutationService, Depends(get_campaign_mutation_service)],
) -> ResponseModel[NotificationCampaignDetailOut]:
    return ApiResponse.success(
        data=await service.update_campaign(
            campaign_id=campaign_id,
            payload=payload,
            actor_user_id=actor.actor_id,
        )
    )


@router.post(
    "/campaigns/{campaign_id}/audience-estimate",
    response_model=ResponseModel[NotificationAudienceEstimateOut],
    summary="Estimate a notification campaign audience",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ)],
)
async def estimate_notification_campaign_audience(
    campaign_id: PublicUUID,
    service: Annotated[NotificationCampaignQueryService, Depends(get_campaign_query_service)],
) -> ResponseModel[NotificationAudienceEstimateOut]:
    return ApiResponse.success(data=await service.estimate_audience(campaign_id))


@router.post(
    "/campaigns/{campaign_id}/preview",
    response_model=ResponseModel[NotificationCampaignPreviewOut],
    summary="Render notification campaign channel previews",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ)],
)
async def preview_notification_campaign(
    campaign_id: PublicUUID,
    service: Annotated[NotificationCampaignQueryService, Depends(get_campaign_query_service)],
) -> ResponseModel[NotificationCampaignPreviewOut]:
    return ApiResponse.success(data=await service.preview(campaign_id))


@router.post(
    "/campaigns/{campaign_id}/publish",
    response_model=ResponseModel[NotificationCampaignPublishOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Publish or schedule a notification campaign",
)
async def publish_notification_campaign(
    campaign_id: PublicUUID,
    payload: NotificationCampaignPublishRequest,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_SEND)
    ],
    service: Annotated[NotificationCampaignMutationService, Depends(get_campaign_mutation_service)],
) -> ResponseModel[NotificationCampaignPublishOut]:
    return ApiResponse.success(
        data=await service.publish_campaign(
            campaign_id=campaign_id,
            payload=payload,
            actor_user_id=actor.actor_id,
        )
    )


@router.post(
    "/campaigns/{campaign_id}/cancel",
    response_model=ResponseModel[NotificationCampaignCancellationOut],
    summary="Cancel a scheduled or dispatching notification campaign",
)
async def cancel_notification_campaign(
    campaign_id: PublicUUID,
    payload: NotificationCampaignRevisionRequest,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_MANAGE)
    ],
    service: Annotated[NotificationCampaignMutationService, Depends(get_campaign_mutation_service)],
) -> ResponseModel[NotificationCampaignCancellationOut]:
    return ApiResponse.success(
        data=await service.cancel_campaign(
            campaign_id=campaign_id,
            expected_revision=payload.expected_revision,
            actor_user_id=actor.actor_id,
        )
    )


@router.get(
    "/campaigns/{campaign_id}/deliveries",
    response_model=ResponseModel[PageData[NotificationDeliveryOut]],
    summary="List a notification campaign delivery ledger",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ)],
)
async def list_notification_campaign_deliveries(
    campaign_id: PublicUUID,
    service: Annotated[NotificationCampaignQueryService, Depends(get_campaign_query_service)],
    params: Annotated[PageParams, Depends(get_page_params)],
    state: list[NotificationDeliveryState] = Query(default=[]),
) -> ResponseModel[PageData[NotificationDeliveryOut]]:
    return ApiResponse.success(
        data=await service.list_deliveries(
            campaign_id=campaign_id,
            params=params,
            states=tuple(state),
        )
    )


@router.post(
    "/campaigns/{campaign_id}/retry-failures",
    response_model=ResponseModel[NotificationCampaignRetryOut],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry failed notification campaign deliveries",
)
async def retry_notification_campaign_failures(
    campaign_id: PublicUUID,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.MESSAGES_DELIVERY_RETRY)
    ],
    service: Annotated[NotificationCampaignMutationService, Depends(get_campaign_mutation_service)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
) -> ResponseModel[NotificationCampaignRetryOut]:
    return ApiResponse.success(
        data=await service.retry_failures(
            campaign_id=campaign_id,
            idempotency_key=idempotency_key,
            actor_user_id=actor.actor_id,
        )
    )


@router.post(
    "/campaigns/{campaign_id}/archive",
    response_model=ResponseModel[NotificationCampaignSummaryOut],
    summary="Archive a terminal notification campaign",
)
async def archive_notification_campaign(
    campaign_id: PublicUUID,
    payload: NotificationCampaignRevisionRequest,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_MANAGE)
    ],
    service: Annotated[NotificationCampaignMutationService, Depends(get_campaign_mutation_service)],
) -> ResponseModel[NotificationCampaignSummaryOut]:
    return ApiResponse.success(
        data=await service.archive_campaign(
            campaign_id=campaign_id,
            expected_revision=payload.expected_revision,
            actor_user_id=actor.actor_id,
        )
    )
