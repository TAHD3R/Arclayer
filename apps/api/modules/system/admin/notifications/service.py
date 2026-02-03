from __future__ import annotations

from uuid import UUID, uuid4

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.core.i18n import t
from apps.api.modules.system.admin.notifications.repository import NotificationRepository
from apps.api.modules.system.admin.notifications.schema import (
    NotificationDeleteResult,
    NotificationDevSeedResult,
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
        workspace_id: UUID,
        user_id: UUID,
        limit: int = 3,
    ) -> NotificationPreviewOut:
        unread_count = await self.repo.get_unread_count(workspace_id=workspace_id, recipient_user_id=user_id)
        items = await self.repo.list_unread_latest(workspace_id=workspace_id, recipient_user_id=user_id, limit=limit)
        return NotificationPreviewOut(
            unread_count=unread_count,
            items=[NotificationOut.model_validate(x, from_attributes=True) for x in items],
        )

    async def list_notifications(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        params: PageParams,
        filters: NotificationListQuery,
    ) -> PageData[NotificationOut]:
        unread_only = filters.status == NotificationListStatus.UNREAD
        category = filters.category.value if filters.category else None
        queryset = self.repo.build_list_queryset(
            workspace_id=workspace_id,
            recipient_user_id=user_id,
            unread_only=unread_only,
            category=category,
        )
        return await paginate_queryset(queryset, params=params, out_schema=NotificationOut)

    async def mark_read(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        notification_id: UUID,
    ) -> NotificationReadResult:
        row = await self.repo.mark_read(
            workspace_id=workspace_id, recipient_user_id=user_id, notification_id=notification_id
        )
        if row is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        return NotificationReadResult(id=row.id, read_at=row.read_at)

    async def mark_all_read(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
    ) -> NotificationReadAllResult:
        total, updated = await self.repo.mark_all_read(workspace_id=workspace_id, recipient_user_id=user_id)
        return NotificationReadAllResult(total_count=total, success_count=updated)

    async def seed_demo_notifications(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        count: int = 8,
    ) -> NotificationDevSeedResult:
        # Security: never expose dev utilities in production.
        if self.settings.app_env not in {"development", "test"}:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        from apps.api.modules.system.models.notification import NotificationCategory, NotificationRecord

        safe_count = max(0, min(int(count), 50))
        if safe_count <= 0:
            return NotificationDevSeedResult(created_count=0)

        templates: list[dict[str, object]] = [
            {
                "category": NotificationCategory.TASK,
                "title_key": "NOTIFICATIONS_DEMO_1_TITLE",
                "body_key": "NOTIFICATIONS_DEMO_1_SUBTITLE",
                "target_to": "/settings/maintenance/snapshots",
            },
            {
                "category": NotificationCategory.SECURITY,
                "title_key": "NOTIFICATIONS_DEMO_2_TITLE",
                "body_key": "NOTIFICATIONS_DEMO_2_SUBTITLE",
                "target_to": "/settings/maintenance/audit-log",
            },
            {
                "category": NotificationCategory.TEAM,
                "title_key": "NOTIFICATIONS_DEMO_3_TITLE",
                "body_key": "NOTIFICATIONS_DEMO_3_SUBTITLE",
                "target_to": "/settings/team/members",
            },
            {
                "category": NotificationCategory.TEAM,
                "title_key": "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
                "body_key": "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
                "target_to": "/settings/team/members",
            },
        ]

        created = 0
        for i in range(safe_count):
            tpl = templates[i % len(templates)]
            title_key = str(tpl["title_key"])
            body_key = str(tpl["body_key"])
            title = t(
                "notifications",
                title_key,
                default="Demo notification",
                name="Alex",
            )
            body = t(
                "notifications",
                body_key,
                default="This is a demo notification for UI testing.",
            )
            # Make dedupe_key unique to avoid collisions with existing records.
            dedupe_key = f"dev.seed:{user_id}:{i}:{uuid4().hex}"
            await NotificationRecord.create(
                workspace_id=workspace_id,
                recipient_user_id=user_id,
                actor_user_id=user_id,
                category=tpl["category"],  # type: ignore[arg-type]
                title=title,
                body=body,
                target_to=str(tpl["target_to"]),
                target_meta={"demo": True},
                event_name="dev.seed",
                dedupe_key=dedupe_key,
            )
            created += 1

        return NotificationDevSeedResult(created_count=created)

    async def delete_notification(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
        notification_id: UUID,
    ) -> NotificationDeleteResult:
        deleted = await self.repo.delete_notification(
            workspace_id=workspace_id,
            recipient_user_id=user_id,
            notification_id=notification_id,
        )
        if deleted <= 0:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        return NotificationDeleteResult(id=notification_id)
