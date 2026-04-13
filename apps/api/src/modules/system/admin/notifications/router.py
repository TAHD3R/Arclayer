from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.system.admin.notifications.schema import (
    NotificationDevSeedRequest,
    NotificationDevSeedResult,
)
from src.modules.system.admin.notifications.service import NotificationService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/notifications",
    tags=["domain.workspaces.notifications"],
    dependencies=[require_workspace_permission("system:notifications:read")],
)


def get_notification_service(settings: Settings = Depends(get_settings)) -> NotificationService:
    return NotificationService(settings)


@router.post(
    "/dev/seed",
    response_model=ResponseModel[NotificationDevSeedResult],
    summary="Seed demo notifications (dev/test only)",
    dependencies=[require_workspace_permission("system:notifications:manage")],
)
async def seed_demo_notifications(
    payload: NotificationDevSeedRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    service: NotificationService = Depends(get_notification_service),
) -> ResponseModel[NotificationDevSeedResult]:
    """Seed demo notifications (dev/test only)."""
    out = await service.seed_demo_notifications(workspace_id=ctx.workspace_id, user_id=user_id, count=payload.count)
    return ApiResponse.success(data=out)
