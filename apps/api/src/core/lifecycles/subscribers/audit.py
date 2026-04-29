from __future__ import annotations

from typing import Any
from uuid import UUID

from src.core.events import Event
from src.core.lifecycles.specs import LifecycleEvent

_AUDIT_EVENT_MAP: dict[str, str] = {
    "after_create": "content.item.created",
    "after_update": "content.item.updated",
    "after_delete": "content.item.deleted",
    "after_publish": "content.item.published",
}


async def audit_lifecycle_events(event: LifecycleEvent, *, event_bus: Any = None) -> None:
    """Publish lifecycle events as audit events on the EventBus.

    The event_bus is injected from the calling context (EntityManager).
    If no event_bus is provided, this is a no-op.
    """
    if event_bus is None:
        return
    audit_name = _AUDIT_EVENT_MAP.get(str(event.action))
    if audit_name is None:
        return
    item_id = str(event.item_id) if isinstance(event.item_id, UUID) else None
    await event_bus.publish(
        Event(
            name=audit_name,
            payload={
                "model_key": event.model_key,
                "item_id": item_id,
            },
            actor_user_id=str(event.actor_id) if isinstance(event.actor_id, UUID) else None,
        )
    )
