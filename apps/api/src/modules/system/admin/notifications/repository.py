from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User, UserStatus
from src.models.system.notification import NotificationRecord
from src.models.system.notification_campaign import NotificationCampaignRecord, NotificationDeliveryRecord


class NotificationRepository(TortoiseORMRepository):
    @staticmethod
    def _build_scope_condition(*, recipient_user_id: UUID, workspace_id: UUID | None = None) -> Q:
        cond = Q(recipient_user_id=recipient_user_id)
        if workspace_id is not None:
            cond &= Q(workspace_id=workspace_id)
        return cond

    async def list_active_users(self) -> list[User]:
        return await User.filter(status=UserStatus.ACTIVE).order_by("id").all()

    async def get_active_users(self, user_ids: Sequence[UUID]) -> list[User]:
        if not user_ids:
            return []
        return await User.filter(id__in=list(user_ids), status=UserStatus.ACTIVE).order_by("id").all()

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

    async def get_by_user(
        self,
        *,
        recipient_user_id: UUID,
        notification_id: UUID,
    ) -> NotificationRecord | None:
        return await NotificationRecord.filter(
            id=notification_id,
            recipient_user_id=recipient_user_id,
        ).first()

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

    async def record_delivery_interaction(
        self,
        *,
        recipient_user_id: UUID,
        notification_id: UUID,
        interaction: str,
        occurred_at: datetime,
    ) -> NotificationDeliveryRecord | None:
        delivery = await NotificationDeliveryRecord.filter(
            notification_id=notification_id,
            recipient_user_id=recipient_user_id,
        ).first()
        if delivery is None:
            return None
        field = {"read": "read_at", "click": "clicked_at", "dismiss": "dismissed_at"}.get(interaction)
        if field is None:
            raise ValueError("NOTIFICATION_INTERACTION_INVALID")
        fields: dict[str, datetime] = {}
        if getattr(delivery, field) is None:
            fields[field] = occurred_at
        if interaction in {"click", "dismiss"} and delivery.read_at is None:
            fields["read_at"] = occurred_at
        if fields:
            await self.update_fields(delivery, fields=fields)
            await NotificationCampaignRecord.filter(id=delivery.campaign_id).update(
                read_count=await NotificationDeliveryRecord.filter(
                    campaign_id=delivery.campaign_id,
                    read_at__not_isnull=True,
                ).count(),
                clicked_count=await NotificationDeliveryRecord.filter(
                    campaign_id=delivery.campaign_id,
                    clicked_at__not_isnull=True,
                ).count(),
                dismissed_count=await NotificationDeliveryRecord.filter(
                    campaign_id=delivery.campaign_id,
                    dismissed_at__not_isnull=True,
                ).count(),
                updated_at=occurred_at,
            )
        return delivery
