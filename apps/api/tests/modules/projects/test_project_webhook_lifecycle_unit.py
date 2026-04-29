from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest

from src.core.lifecycles.specs import LifecycleAction, LifecycleEvent
from src.modules.projects.webhooks.service import WebhookService


class _FakeWorkspaceWebhooks:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def emit_workspace_event(self, *, workspace_id: UUID, event: str, payload: dict[str, object]) -> None:
        self.calls.append({"workspace_id": workspace_id, "event": event, "payload": payload})


@pytest.mark.asyncio
async def test_lifecycle_webhook_uses_persisted_workspace_webhook_service() -> None:
    workspace_webhooks = _FakeWorkspaceWebhooks()
    service = WebhookService(workspace_webhooks=workspace_webhooks)
    workspace_id = uuid4()
    site_id = uuid4()
    item_id = uuid4()
    actor_id = uuid4()

    await service.handle_lifecycle_event(
        LifecycleEvent(
            action=LifecycleAction.AFTER_PUBLISH,
            workspace_id=workspace_id,
            site_id=site_id,
            model_key="article",
            item_id=item_id,
            actor_id=actor_id,
        )
    )

    assert len(workspace_webhooks.calls) == 1
    call = workspace_webhooks.calls[0]
    payload = cast(dict[str, object], call["payload"])
    assert isinstance(payload, dict)
    assert call["workspace_id"] == workspace_id
    assert call["event"] == "content.item.published"
    assert payload["event"] == "content.item.published"
    assert isinstance(payload["timestamp"], str)
    assert payload["workspace_id"] == str(workspace_id)
    assert payload["site_id"] == str(site_id)
    assert payload["model_key"] == "article"
    assert payload["item_id"] == str(item_id)
    assert payload["actor_user_id"] == str(actor_id)


@pytest.mark.asyncio
async def test_lifecycle_webhook_requires_workspace_id() -> None:
    service = WebhookService(workspace_webhooks=_FakeWorkspaceWebhooks())

    with pytest.raises(RuntimeError, match="workspace_id"):
        await service.handle_lifecycle_event(
            LifecycleEvent(
                action=LifecycleAction.AFTER_CREATE,
                model_key="article",
                item_id=uuid4(),
            )
        )
