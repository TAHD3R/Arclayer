from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from src.common.email.service import EmailService
from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.models.organization.user import User
from src.modules.auth.http.service import require_super_admin
from src.modules.system.admin.notifications.broadcast_schema import (
    GlobalNotificationBroadcastIn,
    GlobalNotificationBroadcastOut,
)
from src.modules.system.admin.notifications.broadcast_service import (
    GlobalNotificationBroadcastService,
)
from src.modules.system.admin.notifications.repository import NotificationRepository

router = APIRouter(
    tags=["internal.system.notifications"],
    dependencies=[Depends(require_super_admin)],
)


def get_global_notification_broadcast_service(
    settings: Annotated[Settings, Depends(get_settings)],
    connector_registry: Annotated[ConnectorRegistry, Depends(get_connector_registry)],
) -> GlobalNotificationBroadcastService:
    return GlobalNotificationBroadcastService(
        settings,
        audience_reader=NotificationRepository(),
        email_sender=EmailService(settings, connector_registry=connector_registry),
    )


@router.post(
    "/broadcasts",
    response_model=ResponseModel[GlobalNotificationBroadcastOut],
    status_code=status.HTTP_201_CREATED,
    summary="Broadcast a global notification",
)
async def create_global_notification_broadcast(
    payload: GlobalNotificationBroadcastIn,
    actor: Annotated[User, Depends(require_super_admin)],
    service: Annotated[
        GlobalNotificationBroadcastService,
        Depends(get_global_notification_broadcast_service),
    ],
) -> ResponseModel[GlobalNotificationBroadcastOut]:
    out = await service.create_broadcast(payload=payload, actor_user_id=actor.id)
    return ApiResponse.success(data=out)
