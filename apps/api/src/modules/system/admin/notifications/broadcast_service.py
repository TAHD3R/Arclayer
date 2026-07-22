from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.core.services import BaseService
from src.models.system.notification import NotificationCategory
from src.modules.system.admin.notifications.broadcast_schema import (
    GlobalNotificationBroadcastIn,
    GlobalNotificationBroadcastOut,
)
from src.modules.system.admin.notifications.catalog import (
    create_notification_record,
    is_notification_group_enabled_for_event,
)
from src.modules.system.admin.notifications.preferences import (
    is_notification_channel_enabled_for_event,
)

GLOBAL_NOTIFICATION_WORKSPACE_ID = UUID(int=0)
GLOBAL_NOTIFICATION_EVENT = "system.broadcast"


class BroadcastRecipient(Protocol):
    id: UUID
    email: str | None


class BroadcastAudienceReader(Protocol):
    async def list_active_users(self) -> Sequence[BroadcastRecipient]: ...


class NotificationEmailSender(Protocol):
    async def is_enabled(self) -> bool: ...

    async def send_notification(
        self,
        *,
        recipient: str,
        title: str,
        body: str | None,
        action_to: str | None,
        action_label: str | None,
        locale: str | None = None,
    ) -> object: ...


class GlobalNotificationBroadcastService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        audience_reader: BroadcastAudienceReader,
        email_sender: NotificationEmailSender,
    ) -> None:
        super().__init__(settings)
        self.audience_reader = audience_reader
        self.email_sender = email_sender

    async def create_broadcast(
        self,
        *,
        payload: GlobalNotificationBroadcastIn,
        actor_user_id: UUID,
    ) -> GlobalNotificationBroadcastOut:
        broadcast_id = uuid7()
        policy_enabled = await is_notification_group_enabled_for_event(
            settings=self.settings,
            event_name=GLOBAL_NOTIFICATION_EVENT,
        )
        if not policy_enabled:
            return GlobalNotificationBroadcastOut(
                broadcast_id=broadcast_id,
                policy_enabled=False,
                audience_count=0,
                in_app_delivered_count=0,
                email_delivered_count=0,
            )

        recipients = await self.audience_reader.list_active_users()
        if payload.deliver_email and not await self.email_sender.is_enabled():
            raise BadRequest(
                message=t("settings", "MAIL_DISABLED"),
                error="MAIL_DISABLED",
            )

        in_app_count = 0
        email_count = 0
        for recipient in recipients:
            if payload.deliver_in_app:
                record = await create_notification_record(
                    settings=self.settings,
                    workspace_id=GLOBAL_NOTIFICATION_WORKSPACE_ID,
                    recipient_user_id=recipient.id,
                    actor_user_id=actor_user_id,
                    category=NotificationCategory.SYSTEM,
                    title=payload.title,
                    body=payload.body,
                    target_to=payload.action_to or "/notifications",
                    target_meta=self._target_meta(payload=payload, broadcast_id=broadcast_id),
                    event_name=GLOBAL_NOTIFICATION_EVENT,
                    dedupe_key=f"system.broadcast:{broadcast_id}",
                )
                if record is not None:
                    in_app_count += 1

            if payload.deliver_email and recipient.email:
                email_enabled = await is_notification_channel_enabled_for_event(
                    user_id=recipient.id,
                    event_name=GLOBAL_NOTIFICATION_EVENT,
                    channel="email",
                )
                if email_enabled:
                    await self.email_sender.send_notification(
                        recipient=recipient.email,
                        title=payload.title,
                        body=payload.body,
                        action_to=payload.action_to,
                        action_label=payload.action_label,
                    )
                    email_count += 1

        return GlobalNotificationBroadcastOut(
            broadcast_id=broadcast_id,
            policy_enabled=True,
            audience_count=len(recipients),
            in_app_delivered_count=in_app_count,
            email_delivered_count=email_count,
        )

    @staticmethod
    def _target_meta(
        *,
        payload: GlobalNotificationBroadcastIn,
        broadcast_id: UUID,
    ) -> dict[str, object]:
        return {
            "broadcastId": str(broadcast_id),
            "presentation": str(payload.presentation),
            "severity": str(payload.severity),
            "actionLabel": payload.action_label,
        }
