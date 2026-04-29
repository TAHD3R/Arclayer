from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any
from uuid import UUID


class LifecycleAction(StrEnum):
    BEFORE_CREATE = "before_create"
    AFTER_CREATE = "after_create"
    BEFORE_UPDATE = "before_update"
    AFTER_UPDATE = "after_update"
    BEFORE_DELETE = "before_delete"
    AFTER_DELETE = "after_delete"
    BEFORE_PUBLISH = "before_publish"
    AFTER_PUBLISH = "after_publish"


@dataclass(frozen=True, slots=True)
class LifecycleEvent:
    action: LifecycleAction
    model_key: str
    workspace_id: UUID | None = None
    site_id: UUID | None = None
    item_id: UUID | None = None
    data: dict[str, Any] = field(default_factory=dict)
    result: Any = None
    actor_id: UUID | None = None
    state: dict[str, Any] = field(default_factory=dict)


LifecycleSubscriber = Callable[[LifecycleEvent], Awaitable[None]]
