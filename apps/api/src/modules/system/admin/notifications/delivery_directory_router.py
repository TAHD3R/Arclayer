from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.system.admin.notifications.delivery_directory_repository import (
    NotificationDeliveryDirectoryRepository,
)
from src.modules.system.admin.notifications.delivery_directory_schema import NotificationDeliveryDirectoryOut
from src.modules.system.admin.notifications.delivery_directory_service import NotificationDeliveryDirectoryService

router = APIRouter()


def get_notification_delivery_directory_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> NotificationDeliveryDirectoryService:
    return NotificationDeliveryDirectoryService(
        NotificationDeliveryDirectoryRepository(),
        settings=settings,
    )


@router.get(
    "/deliveries",
    response_model=ResponseModel[PageData[NotificationDeliveryDirectoryOut]],
    summary="List notification deliveries across campaigns",
    dependencies=[require_platform_permission(PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ)],
)
async def list_notification_delivery_directory(
    service: Annotated[
        NotificationDeliveryDirectoryService,
        Depends(get_notification_delivery_directory_service),
    ],
    params: Annotated[PageParams, Depends(get_page_params)],
    q: str | None = Query(default=None),
    campaign_id: list[PublicUUID] = Query(default=[]),
    state: list[NotificationDeliveryState] = Query(default=[]),
    channel: list[NotificationCampaignChannel] = Query(default=[]),
    presentation: list[NotificationPresentation] = Query(default=[]),
    retryable: bool | None = Query(default=None),
    ordering: str | None = Query(default=None),
) -> ResponseModel[PageData[NotificationDeliveryDirectoryOut]]:
    return ApiResponse.success(
        data=await service.list_deliveries(
            params=params,
            q=q,
            campaign_ids=tuple(campaign_id),
            states=tuple(state),
            channels=tuple(channel),
            presentations=tuple(presentation),
            retryable=retryable,
            ordering=ordering,
        )
    )
