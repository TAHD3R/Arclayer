from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.expressions import Q

from apps.api.src.common.repositories import BaseRepository
from apps.api.src.modules.system.models.notification import NotificationRecord


class NotificationRepository(BaseRepository):
    @staticmethod
    def _build_scope_condition(*, recipient_user_id: UUID, workspace_id: UUID | None = None) -> Q:
        cond = Q(recipient_user_id=recipient_user_id)
        if workspace_id is not None:
            cond &= Q(workspace_id=workspace_id)
        return cond

    async def get_unread_count(self, *, workspace_id: UUID, recipient_user_id: UUID) -> int:
        return int(
            await NotificationRecord.filter(
                workspace_id=workspace_id,
                recipient_user_id=recipient_user_id,
                read_at=None,
            ).count()
        )

    async def get_unread_count_by_user(self, *, recipient_user_id: UUID) -> int:
        return int(await NotificationRecord.filter(recipient_user_id=recipient_user_id, read_at=None).count())

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

    async def list_unread_latest_by_user(
        self,
        *,
        recipient_user_id: UUID,
        limit: int,
    ) -> list[NotificationRecord]:
        safe_limit = max(0, min(int(limit), 20))
        if safe_limit <= 0:
            return []
        return await (
            NotificationRecord
            .filter(recipient_user_id=recipient_user_id, read_at=None)
            .order_by("-created_at")
            .limit(safe_limit)
        )

    def build_list_queryset(
        self,
        *,
        workspace_id: UUID,
        recipient_user_id: UUID,
        unread_only: bool,
        archived_only: bool = False,
        category: str | None,
    ):
        cond = self._build_scope_condition(workspace_id=workspace_id, recipient_user_id=recipient_user_id)
        if archived_only:
            cond &= Q(archived_at__not_isnull=True)
        elif unread_only:
            cond &= Q(read_at=None) & Q(archived_at=None)
        else:
            # "all" excludes archived
            cond &= Q(archived_at=None)
        if category:
            cond &= Q(category=category)
        return NotificationRecord.filter(cond).order_by("-created_at")

    def build_global_list_queryset(
        self,
        *,
        recipient_user_id: UUID,
        unread_only: bool,
        archived_only: bool = False,
        category: str | None,
    ):
        cond = self._build_scope_condition(recipient_user_id=recipient_user_id)
        if archived_only:
            cond &= Q(archived_at__not_isnull=True)
        elif unread_only:
            cond &= Q(read_at=None) & Q(archived_at=None)
        else:
            cond &= Q(archived_at=None)
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

    async def mark_read_by_user(
        self,
        *,
        recipient_user_id: UUID,
        notification_id: UUID,
    ) -> NotificationRecord | None:
        row = await NotificationRecord.filter(
            id=notification_id,
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

    async def mark_all_read_by_user(
        self,
        *,
        recipient_user_id: UUID,
    ) -> tuple[int, int]:
        queryset = NotificationRecord.filter(
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

    async def delete_notification_by_user(
        self,
        *,
        recipient_user_id: UUID,
        notification_id: UUID,
    ) -> int:
        return int(
            await NotificationRecord.filter(
                id=notification_id,
                recipient_user_id=recipient_user_id,
            ).delete()
        )

    async def archive_notification_by_user(
        self,
        *,
        recipient_user_id: UUID,
        notification_id: UUID,
    ) -> NotificationRecord | None:
        row = await NotificationRecord.filter(
            id=notification_id,
            recipient_user_id=recipient_user_id,
        ).first()
        if row is None:
            return None
        if row.archived_at is not None:
            return row
        now = datetime.now(tz=UTC)
        row.archived_at = now
        if row.read_at is None:
            row.read_at = now
        await row.save(update_fields=["archived_at", "read_at", "updated_at"])
        return row
