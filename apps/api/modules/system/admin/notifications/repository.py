from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.expressions import Q

from apps.api.common.repositories import BaseRepository
from apps.api.modules.system.models.notification import NotificationRecord


class NotificationRepository(BaseRepository):
    async def get_unread_count(self, *, workspace_id: UUID, recipient_user_id: UUID) -> int:
        return int(
            await NotificationRecord.filter(
                workspace_id=workspace_id,
                recipient_user_id=recipient_user_id,
                read_at=None,
            ).count()
        )

    async def list_unread_latest(
        self,
        *,
        workspace_id: UUID,
        recipient_user_id: UUID,
        limit: int,
    ) -> list[NotificationRecord]:
        safe_limit = max(0, min(int(limit), 20))
        if safe_limit <= 0:
            return []
        return await (
            NotificationRecord
            .filter(
                workspace_id=workspace_id,
                recipient_user_id=recipient_user_id,
                read_at=None,
            )
            .order_by("-created_at")
            .limit(safe_limit)
        )

    def build_list_queryset(
        self,
        *,
        workspace_id: UUID,
        recipient_user_id: UUID,
        unread_only: bool,
        category: str | None,
    ):
        cond = Q(workspace_id=workspace_id) & Q(recipient_user_id=recipient_user_id)
        if unread_only:
            cond &= Q(read_at=None)
        if category:
            cond &= Q(category=category)
        return NotificationRecord.filter(cond).order_by("-created_at")

    async def mark_read(
        self,
        *,
        workspace_id: UUID,
        recipient_user_id: UUID,
        notification_id: UUID,
    ) -> NotificationRecord | None:
        row = await NotificationRecord.filter(
            id=notification_id,
            workspace_id=workspace_id,
            recipient_user_id=recipient_user_id,
        ).first()
        if row is None:
            return None
        if row.read_at is not None:
            return row
        row.read_at = datetime.now(tz=UTC)
        await row.save(update_fields=["read_at", "updated_at"])
        return row

    async def mark_all_read(
        self,
        *,
        workspace_id: UUID,
        recipient_user_id: UUID,
    ) -> tuple[int, int]:
        queryset = NotificationRecord.filter(
            workspace_id=workspace_id,
            recipient_user_id=recipient_user_id,
            read_at=None,
        )
        total = int(await queryset.count())
        if total <= 0:
            return 0, 0
        now = datetime.now(tz=UTC)
        updated = int(await queryset.update(read_at=now))
        return total, updated

    async def delete_notification(
        self,
        *,
        workspace_id: UUID,
        recipient_user_id: UUID,
        notification_id: UUID,
    ) -> int:
        return int(
            await NotificationRecord.filter(
                id=notification_id,
                workspace_id=workspace_id,
                recipient_user_id=recipient_user_id,
            ).delete()
        )
