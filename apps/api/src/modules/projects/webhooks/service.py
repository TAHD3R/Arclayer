from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.core.lifecycles.specs import LifecycleEvent
from src.core.services import BaseService
from src.modules.workspaces.settings.integrations.webhooks.service import WebhooksService as WorkspaceWebhooksService

_WEBHOOK_EVENT_MAP: dict[str, str] = {
    "after_create": "content.item.created",
    "after_update": "content.item.updated",
    "after_delete": "content.item.deleted",
    "after_publish": "content.item.published",
}


class WorkspaceWebhookEmitter(Protocol):
    async def emit_workspace_event(self, *, workspace_id: UUID, event: str, payload: dict[str, object]) -> None: ...


class WebhookService(BaseService):
    """Dispatches content lifecycle webhooks through persisted workspace subscriptions."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        workspace_webhooks: WorkspaceWebhookEmitter | None = None,
    ) -> None:
        if workspace_webhooks is None and settings is None:
            raise ValueError("settings are required when workspace_webhooks is not provided")
        super().__init__(settings)
        if workspace_webhooks is not None:
            self._workspace_webhooks = workspace_webhooks
        else:
            assert settings is not None
            self._workspace_webhooks = WorkspaceWebhooksService(settings)

    async def handle_lifecycle_event(self, event: LifecycleEvent) -> None:
        webhook_event = _WEBHOOK_EVENT_MAP.get(str(event.action))
        if webhook_event is None:
            return
        if event.workspace_id is None:
            raise RuntimeError("Lifecycle webhook dispatch requires workspace_id")

        payload: dict[str, object] = {
            "event": webhook_event,
            "timestamp": datetime.now(UTC).isoformat(),
            "workspace_id": str(event.workspace_id),
            "site_id": str(event.site_id) if event.site_id else None,
            "model_key": event.model_key,
            "item_id": str(event.item_id) if event.item_id else None,
            "actor_user_id": str(event.actor_id) if event.actor_id else None,
        }
        await self._workspace_webhooks.emit_workspace_event(
            workspace_id=event.workspace_id,
            event=webhook_event,
            payload=payload,
        )

    async def close(self) -> None:
        return None
