from __future__ import annotations

from src.core.lifecycles.specs import LifecycleAction, LifecycleEvent


async def require_target_context(event: LifecycleEvent) -> None:
    if event.action in {LifecycleAction.BEFORE_DELETE, LifecycleAction.BEFORE_PUBLISH} and event.item_id is None:
        raise ValueError(f"{event.action} requires item_id")
