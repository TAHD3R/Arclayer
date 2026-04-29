from __future__ import annotations

from datetime import UTC, datetime

from src.core.lifecycles.specs import LifecycleEvent


async def auto_timestamps(event: LifecycleEvent) -> None:
    """Set created_at on before_create, updated_at on before_create and before_update."""
    now = datetime.now(UTC)
    if event.action == "before_create":
        event.data.setdefault("created_at", now)
        event.data.setdefault("updated_at", now)
    elif event.action == "before_update":
        event.data["updated_at"] = now
