from __future__ import annotations

import asyncio
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import Request

from src.core.events import Event, EventBus
from src.core.exceptions import ServiceUnavailable
from src.core.i18n import t
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.http.schema import ProjectRequestContext


def get_event_bus(request: Request) -> EventBus:
    bus = getattr(request.app.state, "event_bus", None)
    if bus is None:
        raise ServiceUnavailable(
            message=t("settings:EVENT_BUS_UNAVAILABLE"),
            error="EVENT_BUS_UNAVAILABLE",
        )
    return bus


def get_project_content_canonical_items_service() -> ProjectContentCanonicalItemsService:
    return ProjectContentCanonicalItemsService(repo=ProjectContentItemsRepository())


def get_project_content_canonical_item_reads() -> ProjectContentCanonicalItemReadService:
    return ProjectContentCanonicalItemReadService(repo=ProjectContentItemsRepository())


async def publish_content_activity_event(
    *,
    actor_user_id: UUID | None,
    project_ctx: ProjectRequestContext,
    entity_id: UUID,
    entity_type: str,
    event_bus: EventBus,
    event_name: str,
    properties: dict[str, object | None] | None = None,
) -> None:
    try:
        await event_bus.publish(
            Event(
                name=event_name,
                payload={
                    "organization_id": str(project_ctx.organization_id),
                    "workspace_id": str(project_ctx.workspace_id),
                    "entity_type": entity_type,
                    "entity_id": str(entity_id),
                    **(properties or {}),
                },
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id) if actor_user_id is not None else None,
            )
        )
    except (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        return
