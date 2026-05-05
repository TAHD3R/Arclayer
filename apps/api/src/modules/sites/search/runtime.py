from __future__ import annotations

from uuid import UUID

from fastapi import FastAPI

from src.config import Settings
from src.core.events import Event, EventBus
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.core.lifecycles.specs import LifecycleAction, LifecycleEvent
from src.core.logging import get_logger
from src.modules.sites.search.service import ContentSearchService

logger = get_logger(__name__)


async def register_content_search_runtime(
    app: FastAPI,
    settings: Settings,
    *,
    event_bus: EventBus,
    lifecycle_dispatcher: LifecycleDispatcher,
) -> None:
    search_service = ContentSearchService(settings)
    app.state.content_search_service = search_service
    if not settings.search.enabled:
        return

    async def reindex_release(event: Event) -> None:
        site_id = _uuid_from_payload(event, "site_id")
        if site_id is None:
            logger.warning("Search reindex skipped because release event has no site_id", event_name=event.name)
            return
        runtime_context = await search_service.runtime_context_for_site(site_id=site_id)
        await search_service.reindex_runtime(runtime_context=runtime_context)

    async def remove_deleted_item(event: LifecycleEvent) -> None:
        if event.site_id is None or event.item_id is None:
            return
        await search_service.remove_item_from_site_models(site_id=event.site_id, item_id=event.item_id)

    await event_bus.subscribe(
        subscriber_id="content-search",
        event_name="release.published",
        handler=reindex_release,
        priority=0,
        name="content-search:release-published",
    )
    await event_bus.subscribe(
        subscriber_id="content-search",
        event_name="release.rolled_back",
        handler=reindex_release,
        priority=0,
        name="content-search:release-rolled-back",
    )
    await lifecycle_dispatcher.register(
        subscriber_id="content-search",
        action=LifecycleAction.AFTER_DELETE,
        handler=remove_deleted_item,
    )


def _uuid_from_payload(event: Event, key: str) -> UUID | None:
    raw = event.payload.get(key)
    if raw is None:
        return None
    try:
        return UUID(str(raw))
    except ValueError:
        logger.warning("Search event payload id is invalid", event_name=event.name, field=key, value=str(raw))
        return None
