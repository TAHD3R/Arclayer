from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.core.events import Event, EventBus
from src.modules.system.admin.notifications.catalog import (
    NotificationDefinition,
    NotificationProjectTargetTemplate,
    create_notification_record,
    get_notification_definition,
)
from src.modules.system.admin.notifications.schema import (
    NotificationNavigationTarget,
    NotificationProjectTarget,
)

SUBSCRIBER_ID = "system.notifications.events"
NOTIFICATION_EVENT_NAMES: tuple[str, ...] = (
    "project.api_key.rotated",
    "project.api_key.revoked",
    "project.preview_token.created",
    "project.content.item.workflow.updated",
)


class NotificationRecipient(Protocol):
    id: UUID


class NotificationAudienceReader(Protocol):
    async def get_active_users(self, user_ids: Sequence[UUID]) -> Sequence[NotificationRecipient]: ...


class NotificationEventRuntime:
    def __init__(
        self,
        settings: Settings,
        *,
        audience_reader: NotificationAudienceReader,
    ) -> None:
        self.settings = settings
        self.audience_reader = audience_reader

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

        workspace_id = self._workspace_id(event)
        target = self._target(definition=definition, event=event)
        recipients = await self._recipients(event)
        if not recipients:
            raise ValueError(f"Notification event has no active recipients: {event.name}")

        title = self._translate(definition.title_i18n)
        body = self._translate(definition.description_i18n)
        actor_user_id = self._uuid_or_none(event.actor_user_id)
        dedupe_key = self._dedupe_key(event)
        for recipient in recipients:
            await self._deliver_to_recipient(
                definition=definition,
                recipient=recipient,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                title=title,
                body=body,
                target=target,
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
        target: NotificationNavigationTarget,
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
            target=target,
            event_name=definition.event_name,
            dedupe_key=f"{dedupe_key}:{recipient.id}",
        )

    @staticmethod
    def _target(*, definition: NotificationDefinition, event: Event) -> NotificationNavigationTarget:
        template = definition.target
        if not isinstance(template, NotificationProjectTargetTemplate):
            return template
        project_id = NotificationEventRuntime._required_uuid(
            event.payload.get("project_id"),
            field_name="project_id",
            event_name=event.name,
        )
        entity_id = (
            NotificationEventRuntime._required_uuid(
                event.payload.get("entity_id"),
                field_name="entity_id",
                event_name=event.name,
            )
            if template.focus is not None
            else None
        )
        return NotificationProjectTarget(
            project_id=project_id,
            destination=template.destination,
            entity_id=entity_id,
            focus=template.focus,
        )

    async def _recipients(self, event: Event) -> Sequence[NotificationRecipient]:
        actor_user_id = self._uuid_or_none(event.actor_user_id)
        recipient_user_id = self._uuid_or_none(event.payload.get("workflow_assignee_user_id"))
        resolved_user_id = recipient_user_id or actor_user_id
        if resolved_user_id is None:
            return []
        return await self.audience_reader.get_active_users([resolved_user_id])

    @staticmethod
    def _workspace_id(event: Event) -> UUID:
        workspace_id = NotificationEventRuntime._uuid_or_none(event.payload.get("workspace_id"))
        if workspace_id is None:
            raise ValueError(f"Notification event is missing workspace_id: {event.name}")
        return workspace_id

    @staticmethod
    def _translate(resource_key: str) -> str:
        namespace, separator, key = resource_key.partition(":")
        if not separator or not namespace or not key:
            raise ValueError(f"Invalid notification i18n key: {resource_key}")
        from src.core.i18n import t

        return t(namespace, key)

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

    @staticmethod
    def _required_uuid(value: object, *, field_name: str, event_name: str) -> UUID:
        parsed = NotificationEventRuntime._uuid_or_none(value)
        if parsed is None:
            raise ValueError(f"Notification event is missing {field_name}: {event_name}")
        return parsed
