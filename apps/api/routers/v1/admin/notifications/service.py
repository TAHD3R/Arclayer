from __future__ import annotations

from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.core.i18n import t
from apps.api.routers.v1.admin.notifications.repository import NotificationRepository
from apps.api.routers.v1.admin.notifications.schema import (
    NotificationListQuery,
    NotificationListStatus,
    NotificationOut,
    NotificationPreviewOut,
    NotificationReadAllResult,
    NotificationReadResult,
)


class NotificationService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = NotificationRepository()

    async def get_unread_preview(
        self,
        *,
        org_id: UUID,
        user_id: UUID,
        limit: int = 3,
    ) -> NotificationPreviewOut:
        unread_count = await self.repo.get_unread_count(org_id=org_id, recipient_user_id=user_id)
        items = await self.repo.list_unread_latest(org_id=org_id, recipient_user_id=user_id, limit=limit)
        return NotificationPreviewOut(
            unread_count=unread_count,
            items=[NotificationOut.model_validate(x, from_attributes=True) for x in items],
        )

    async def list_notifications(
        self,
        *,
        org_id: UUID,
        user_id: UUID,
        params: PageParams,
        filters: NotificationListQuery,
    ) -> PageData[NotificationOut]:
        unread_only = filters.status == NotificationListStatus.UNREAD
        category = filters.category.value if filters.category else None
        queryset = self.repo.build_list_queryset(
            org_id=org_id,
            recipient_user_id=user_id,
            unread_only=unread_only,
            category=category,
        )
        return await paginate_queryset(queryset, params=params, out_schema=NotificationOut)

    async def mark_read(
        self,
        *,
        org_id: UUID,
        user_id: UUID,
        notification_id: UUID,
    ) -> NotificationReadResult:
        row = await self.repo.mark_read(org_id=org_id, recipient_user_id=user_id, notification_id=notification_id)
        if row is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        return NotificationReadResult(id=row.id, read_at=row.read_at)

    async def mark_all_read(
        self,
        *,
        org_id: UUID,
        user_id: UUID,
    ) -> NotificationReadAllResult:
        total, updated = await self.repo.mark_all_read(org_id=org_id, recipient_user_id=user_id)
        return NotificationReadAllResult(total_count=total, success_count=updated)
