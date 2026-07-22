from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.core.events import Event, EventBus
from src.core.i18n import t
from src.modules.system.admin.notifications.catalog import (
    NotificationDefinition,
    create_notification_record,
    get_notification_definition,
    is_notification_group_enabled_for_event,
)
from src.modules.system.admin.notifications.preferences import (
    is_notification_channel_enabled_for_event,
)

SUBSCRIBER_ID = "system.notifications.events"
GLOBAL_NOTIFICATION_WORKSPACE_ID = UUID(int=0)
NOTIFICATION_EVENT_NAMES: tuple[str, ...] = (
    "project.api_key.rotated",
    "project.api_key.revoked",
    "project.preview_token.created",
    "project.content.item.workflow.updated",
    "system.mail.updated",
    "system.storage.updated",
    "system.settings.feature_flags.updated",
)
SYSTEM_NOTIFICATION_EVENTS = frozenset({
    "system.mail.updated",
    "system.storage.updated",
    "system.settings.feature_flags.updated",
})


class NotificationRecipient(Protocol):
    id: UUID
    email: str | None


class NotificationAudienceReader(Protocol):
    async def get_active_users(self, user_ids: Sequence[UUID]) -> Sequence[NotificationRecipient]: ...

    async def list_active_super_admins(self) -> Sequence[NotificationRecipient]: ...


class NotificationEmailSender(Protocol):
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


class NotificationEventRuntime:
    def __init__(
        self,
        settings: Settings,
        *,
        audience_reader: NotificationAudienceReader,
        email_sender: NotificationEmailSender,
    ) -> None:
        self.settings = settings
        self.audience_reader = audience_reader
        self.email_sender = email_sender

    async def start(self, *, event_bus: EventBus) -> None:
        for event_name in NOTIFICATION_EVENT_NAMES:
            await event_bus.subscribe(
                subscriber_id=SUBSCRIBER_ID,
                event_name=event_name,
                handler=self.handle_event,
                priority=-20,
                name="notification-event-delivery",
            )

    async def stop(self, *, event_bus: EventBus) -> None:
        await event_bus.unsubscribe_all(SUBSCRIBER_ID)

    async def handle_event(self, event: Event) -> None:
        definition = get_notification_definition(event.name)
        if definition is None:
            raise ValueError(f"Unknown notification event: {event.name}")
        if not await is_notification_group_enabled_for_event(settings=self.settings, event_name=event.name):
            return

        workspace_id = self._workspace_id(event)
        recipients = await self._recipients(event)
        if not recipients:
            raise ValueError(f"Notification event has no active recipients: {event.name}")

        title = self._translate(definition.title_i18n)
        body = self._translate(definition.description_i18n)
        actor_user_id = self._uuid_or_none(event.actor_user_id)
        target_meta = self._target_meta(event)
        dedupe_key = self._dedupe_key(event)
        for recipient in recipients:
            await self._deliver_to_recipient(
                definition=definition,
                recipient=recipient,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                title=title,
                body=body,
                target_meta=target_meta,
                dedupe_key=dedupe_key,
            )

    async def _deliver_to_recipient(
        self,
        *,
        definition: NotificationDefinition,
        recipient: NotificationRecipient,
        workspace_id: UUID,
        actor_user_id: UUID | None,
        title: str,
        body: str,
        target_meta: dict[str, object],
        dedupe_key: str,
    ) -> None:
        await create_notification_record(
            settings=self.settings,
            workspace_id=workspace_id,
            recipient_user_id=recipient.id,
            actor_user_id=actor_user_id,
            category=definition.category,
            title=title,
            body=body,
            target_to=definition.target_to,
            target_meta=target_meta,
            event_name=definition.event_name,
            dedupe_key=f"{dedupe_key}:{recipient.id}",
        )
        if recipient.email is None:
            return
        if not await is_notification_channel_enabled_for_event(
            user_id=recipient.id,
            event_name=definition.event_name,
            channel="email",
        ):
            return
        await self.email_sender.send_notification(
            recipient=recipient.email,
            title=title,
            body=body,
            action_to=definition.target_to,
            action_label=t("notifications", "NOTIFICATIONS_EMAIL_ACTION"),
        )

    async def _recipients(self, event: Event) -> Sequence[NotificationRecipient]:
        if event.name in SYSTEM_NOTIFICATION_EVENTS:
            return await self.audience_reader.list_active_super_admins()

        actor_user_id = self._uuid_or_none(event.actor_user_id)
        recipient_user_id = self._uuid_or_none(event.payload.get("workflow_assignee_user_id"))
        resolved_user_id = recipient_user_id or actor_user_id
        if resolved_user_id is None:
            return []
        return await self.audience_reader.get_active_users([resolved_user_id])

    @staticmethod
    def _workspace_id(event: Event) -> UUID:
        if event.name in SYSTEM_NOTIFICATION_EVENTS:
            return GLOBAL_NOTIFICATION_WORKSPACE_ID
        workspace_id = NotificationEventRuntime._uuid_or_none(event.payload.get("workspace_id"))
        if workspace_id is None:
            raise ValueError(f"Notification event is missing workspace_id: {event.name}")
        return workspace_id

    @staticmethod
    def _translate(resource_key: str) -> str:
        namespace, separator, key = resource_key.partition(":")
        if not separator or not namespace or not key:
            raise ValueError(f"Invalid notification i18n key: {resource_key}")
        return t(namespace, key)

    @staticmethod
    def _target_meta(event: Event) -> dict[str, object]:
        payload = event.payload
        return {
            "eventName": event.name,
            "entityId": payload.get("entity_id"),
            "entityType": payload.get("entity_type"),
            "projectId": payload.get("project_id"),
            "siteId": payload.get("site_id"),
            "traceId": event.trace_id,
        }

    @staticmethod
    def _dedupe_key(event: Event) -> str:
        identity = event.trace_id or event.occurred_at.isoformat()
        entity_id = str(event.payload.get("entity_id") or "global")
        return f"{event.name}:{entity_id}:{identity}"

    @staticmethod
    def _uuid_or_none(value: object) -> UUID | None:
        if value is None:
            return None
        try:
            return UUID(str(value))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid notification UUID: {value}") from exc
