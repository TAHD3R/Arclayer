from __future__ import annotations

from collections.abc import Awaitable, Callable
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.common.types.json_types import JsonObject


class LifecycleAction(StrEnum):
    BEFORE_CREATE = "before_create"
    AFTER_CREATE = "after_create"
    BEFORE_UPDATE = "before_update"
    AFTER_UPDATE = "after_update"
    BEFORE_DELETE = "before_delete"
    AFTER_DELETE = "after_delete"
    BEFORE_PUBLISH = "before_publish"
    AFTER_PUBLISH = "after_publish"


class LifecycleEvent(BaseModel):
    model_config = ConfigDict(frozen=True)
    action: LifecycleAction
    model_key: str
    workspace_id: UUID | None = None
    site_id: UUID | None = None
    item_id: UUID | None = None
    data: dict[str, object] = Field(default_factory=dict)
    result: object | None = None
    actor_id: UUID | None = None
    state: JsonObject = Field(default_factory=dict)


LifecycleSubscriber = Callable[[LifecycleEvent], Awaitable[None]]
