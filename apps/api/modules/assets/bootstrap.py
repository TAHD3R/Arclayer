from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.core.logging import get_logger
from apps.api.infra.jobs.assets_thumbnails import ASSET_THUMBNAILS_JOB_NAME, generate_asset_thumbnails
from apps.api.infra.jobs.client import get_arq_client
from apps.api.modules.assets.events import ASSET_UPLOADED_EVENT
from apps.api.plugin.event_bus import Event, EventBus

logger = get_logger(__name__)
_FATAL_ASSET_PROCESSOR_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ASSET_PROCESSOR_ERRORS):
        raise exc


async def register_core_asset_processors(app: FastAPI, event_bus: EventBus, settings: Settings) -> None:
    """
    Register core asset processors on the in-process EventBus.

    Notes:
    - This is best-effort. In SaaS/multi-replica mode we enqueue to the arq worker.
    - If arq is disabled/unavailable, we fall back to in-process processing.
    - We keep the core processors lightweight and safe; they must never crash the app.
    """

    async def _on_asset_uploaded(event: Event) -> None:
        # Thumbnails are a performance optimization; always best-effort.
        try:
            raw_asset_id = (event.payload or {}).get("asset_id")
            raw_workspace_id = (event.payload or {}).get("workspace_id")
            if not raw_asset_id or not raw_workspace_id:
                return

            asset_id = UUID(str(raw_asset_id))
            workspace_id = UUID(str(raw_workspace_id))
            # Try enqueueing to arq (preferred for SaaS/multi-replica).
            if settings.arq.enabled:
                arq = get_arq_client(app)
                if arq is not None:
                    try:
                        await arq.enqueue_job(
                            ASSET_THUMBNAILS_JOB_NAME,
                            str(asset_id),
                            str(workspace_id),
                            _job_id=f"asset-thumbs:{asset_id}",
                            _expires=60 * 60,
                        )
                        return
                    except BaseException as exc:
                        _raise_if_fatal(exc)
                        logger.warning(
                            "Asset thumbnail enqueue failed, falling back to in-process",
                            action="asset_thumbs_enqueue_failed",
                            workspace_id=str(workspace_id),
                            asset_id=str(asset_id),
                            error=str(exc),
                        )

            # Fallback: run in-process (best-effort).
            await generate_asset_thumbnails({"settings": settings}, str(asset_id), str(workspace_id))
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Core asset processor failed",
                action="process_asset_upload",
                error_event=ASSET_UPLOADED_EVENT,
                error=str(exc),
            )

    # Subscribe as "core". If the app hot-reloads, duplicate subscriptions may happen;
    await event_bus.subscribe(
        plugin_id="core",
        event_name=ASSET_UPLOADED_EVENT,
        handler=_on_asset_uploaded,
        priority=0,
        name="core:thumbnail-generator",
    )
