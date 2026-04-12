from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import FastAPI

from apps.api.src.common.constants.assets import ASSET_UPLOADED_EVENT
from apps.api.src.config import Settings
from apps.api.src.core.events import Event, EventBus
from apps.api.src.core.logging import get_logger
from apps.api.src.infra.jobs.assets_thumbnails import generate_asset_thumbnails
from apps.api.src.infra.jobs.client import is_taskiq_enabled, try_dedupe_enqueue, try_enqueue_task
from apps.api.src.infra.jobs.tasks import task_generate_asset_thumbnails
from apps.api.src.modules.analytics.ingest.service import ActivityIngestor
from apps.api.src.modules.system.rbac.service import RBACService

logger = get_logger(__name__)
_FATAL_RUNTIME_INIT_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_RUNTIME_INIT_ERRORS):
        raise exc


async def init_domain_runtime(app: FastAPI, settings: Settings, *, event_bus: EventBus) -> None:
    ingestor = ActivityIngestor(settings)
    app.state.activity_ingestor = ingestor
    try:
        await ingestor.start(event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Activity ingestor init failed (ignored)", action="init_activity_ingestor", error=str(exc))

    async def _on_asset_uploaded(event: Event) -> None:
        try:
            raw_asset_id = (event.payload or {}).get("asset_id")
            raw_workspace_id = (event.payload or {}).get("workspace_id")
            if not raw_asset_id or not raw_workspace_id:
                return

            asset_id = UUID(str(raw_asset_id))
            workspace_id = UUID(str(raw_workspace_id))
            if settings.taskiq.enabled and is_taskiq_enabled(app):
                dedupe_ok = await try_dedupe_enqueue(
                    app,
                    dedupe_key=f"taskiq:dedupe:asset-thumbs:{asset_id}",
                    ttl_seconds=60 * 60,
                )
                if dedupe_ok:
                    enqueued = await try_enqueue_task(
                        task_generate_asset_thumbnails,
                        str(asset_id),
                        str(workspace_id),
                    )
                    if enqueued:
                        return

            await generate_asset_thumbnails({"settings": settings}, str(asset_id), str(workspace_id))
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Core asset processor failed",
                action="process_asset_upload",
                error_event=ASSET_UPLOADED_EVENT,
                error=str(exc),
            )

    await event_bus.subscribe(
        subscriber_id="core",
        event_name=ASSET_UPLOADED_EVENT,
        handler=_on_asset_uploaded,
        priority=0,
        name="core:thumbnail-generator",
    )

    if not settings.database.enabled:
        return

    rbac = RBACService(settings)
    await rbac.sync_permission_catalog()
    await rbac.ensure_all_workspaces_ready()


async def close_domain_runtime(app: FastAPI, *, event_bus: EventBus) -> None:
    ingestor: ActivityIngestor | None = getattr(app.state, "activity_ingestor", None)
    if ingestor is None:
        return
    try:
        await ingestor.stop(event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Activity ingestor shutdown failed (ignored)", action="close_activity_ingestor", error=str(exc))
