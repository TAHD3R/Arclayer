from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.http.pagination import PageData, PageParams, paginate_queryset
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.system.admin.notifications.preferences import (
    TOPIC_DEFINITIONS,
    is_topic_channel_mutable,
    load_user_notification_preferences,
    save_user_notification_preference,
)
from src.modules.system.admin.notifications.repository import NotificationRepository
from src.modules.system.admin.notifications.schema import (
    NotificationArchiveResult,
    NotificationDeleteResult,
    NotificationDevSeedResult,
    NotificationInteractionKind,
    NotificationInteractionOut,
    NotificationListQuery,
    NotificationListStatus,
    NotificationOut,
    NotificationPreferenceChannelOut,
    NotificationPreferencePatchIn,
    NotificationPreferencesOut,
    NotificationPreferenceTopicOut,
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

    @staticmethod
    def _build_preferences_out(
        *,
        state: dict[str, dict[str, bool]],
    ) -> NotificationPreferencesOut:
        topics: list[NotificationPreferenceTopicOut] = []
        for topic in TOPIC_DEFINITIONS:
            topic_state = state.get(topic.key, {"in_app": False, "email": False})
            topics.append(
                NotificationPreferenceTopicOut(
                    key=topic.key,
                    category=topic.category,
                    title_i18n=topic.title_i18n,
                    description_i18n=topic.description_i18n,
                    channels={
                        "in_app": NotificationPreferenceChannelOut(
                            enabled=bool(topic_state.get("in_app")),
                            supported=topic.in_app_supported,
                            mutable=is_topic_channel_mutable(topic, "in_app"),
                        ),
                        "email": NotificationPreferenceChannelOut(
                            enabled=bool(topic_state.get("email")),
                            supported=topic.email_supported,
                            mutable=is_topic_channel_mutable(topic, "email"),
                        ),
                    },
                )
            )
        return NotificationPreferencesOut(topics=topics)

    async def get_notification_preferences_for_user(
        self,
        *,
        user_id: UUID,
    ) -> NotificationPreferencesOut:
        state = await load_user_notification_preferences(user_id=user_id)
        return self._build_preferences_out(state=state)

    async def patch_notification_preference_for_user(
        self,
        *,
        user_id: UUID,
        payload: NotificationPreferencePatchIn,
    ) -> NotificationPreferencesOut:
        try:
            state = await save_user_notification_preference(
                user_id=user_id,
                topic_key=payload.topic_key,
                channel=payload.channel,
                enabled=payload.enabled,
            )
        except ValueError as exc:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST"),
                error=str(exc),
            ) from exc
        return self._build_preferences_out(state=state)

    async def get_unread_preview_for_user(
        self,
        *,
        user_id: UUID,
        limit: int = 3,
    ) -> NotificationPreviewOut:
        unread_count = await self.repo.get_unread_count_by_user(recipient_user_id=user_id)
        items = await self.repo.list_unread_latest_by_user(recipient_user_id=user_id, limit=limit)
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
        archived_only = filters.status == NotificationListStatus.ARCHIVED
        unread_only = filters.status == NotificationListStatus.UNREAD
        category = filters.category.value if filters.category else None
        queryset = self.repo.build_list_queryset(
            workspace_id=workspace_id,
            recipient_user_id=user_id,
            unread_only=unread_only,
            archived_only=archived_only,
            category=category,
        )
        return await paginate_queryset(queryset, params=params, out_schema=NotificationOut)

    async def list_notifications_for_user(
        self,
        *,
        user_id: UUID,
        params: PageParams,
        filters: NotificationListQuery,
    ) -> PageData[NotificationOut]:
        archived_only = filters.status == NotificationListStatus.ARCHIVED
        unread_only = filters.status == NotificationListStatus.UNREAD
        category = filters.category.value if filters.category else None
        queryset = self.repo.build_global_list_queryset(
            recipient_user_id=user_id,
            unread_only=unread_only,
            archived_only=archived_only,
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
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        return NotificationReadResult(id=row.id, read_at=row.read_at)

    async def mark_read_for_user(
        self,
        *,
        user_id: UUID,
        notification_id: UUID,
    ) -> NotificationReadResult:
        row = await self.repo.mark_read_by_user(
            recipient_user_id=user_id,
            notification_id=notification_id,
        )
        if row is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        await self.repo.record_delivery_interaction(
            recipient_user_id=user_id,
            notification_id=notification_id,
            interaction=NotificationInteractionKind.READ,
            occurred_at=row.read_at or datetime.now(UTC),
        )
        return NotificationReadResult(id=row.id, read_at=row.read_at)

    async def record_interaction_for_user(
        self,
        *,
        user_id: UUID,
        notification_id: UUID,
        interaction: NotificationInteractionKind,
    ) -> NotificationInteractionOut:
        now = datetime.now(UTC)
        notification = await self.repo.get_by_user(
            recipient_user_id=user_id,
            notification_id=notification_id,
        )
        if notification is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        delivery = await self.repo.record_delivery_interaction(
            recipient_user_id=user_id,
            notification_id=notification_id,
            interaction=str(interaction),
            occurred_at=now,
        )
        if delivery is None:
            raise NotFound(error="NOTIFICATION_CAMPAIGN_DELIVERY_NOT_FOUND")
        if notification.read_at is None:
            notification = await self.repo.mark_read_by_user(
                recipient_user_id=user_id,
                notification_id=notification_id,
            )
            if notification is None:
                raise RuntimeError(f"Notification {notification_id} disappeared while recording an interaction")
        occurred_at = {
            NotificationInteractionKind.READ: delivery.read_at,
            NotificationInteractionKind.CLICK: delivery.clicked_at,
            NotificationInteractionKind.DISMISS: delivery.dismissed_at,
        }[interaction]
        if occurred_at is None:
            raise RuntimeError(f"Notification delivery {delivery.id} did not persist {interaction.value}")
        return NotificationInteractionOut(
            notification_id=notification_id,
            delivery_id=delivery.id,
            kind=interaction,
            occurred_at=occurred_at,
        )

    async def mark_all_read(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
    ) -> NotificationReadAllResult:
        total, updated = await self.repo.mark_all_read(workspace_id=workspace_id, recipient_user_id=user_id)
        return NotificationReadAllResult(total_count=total, success_count=updated)

    async def mark_all_read_for_user(
        self,
        *,
        user_id: UUID,
    ) -> NotificationReadAllResult:
        total, updated = await self.repo.mark_all_read_by_user(recipient_user_id=user_id)
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
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        from src.models.system.notification import NotificationCategory, NotificationRecord

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
                "target_to": "/settings/maintenance/activity",
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
            dedupe_key = f"dev.seed:{user_id}:{i}:{uuid7().hex}"
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
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        return NotificationDeleteResult(id=notification_id)

    async def delete_notification_for_user(
        self,
        *,
        user_id: UUID,
        notification_id: UUID,
    ) -> NotificationDeleteResult:
        deleted = await self.repo.delete_notification_by_user(
            recipient_user_id=user_id,
            notification_id=notification_id,
        )
        if deleted <= 0:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        return NotificationDeleteResult(id=notification_id)

    async def archive_notification_for_user(
        self,
        *,
        user_id: UUID,
        notification_id: UUID,
    ) -> NotificationArchiveResult:
        row = await self.repo.archive_notification_by_user(
            recipient_user_id=user_id,
            notification_id=notification_id,
        )
        if row is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        return NotificationArchiveResult(id=row.id, archived_at=row.archived_at)
