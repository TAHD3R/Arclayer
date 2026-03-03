from __future__ import annotations

import asyncio

from fastapi import FastAPI

from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.modules.analytics.ingest.service import ActivityIngestor
from apps.api.src.plugin.event_bus import EventBus

logger = get_logger(__name__)
_FATAL_ACTIVITY_BOOTSTRAP_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ACTIVITY_BOOTSTRAP_ERRORS):
        raise exc


async def init_activity(app: FastAPI, settings: Settings, *, event_bus: EventBus) -> None:
    """
    Initialize activity ingestion (EventBus subscription + background flush loop).

    Notes:
    - Best-effort: if initialization fails, the app should still start.
    - The ingestor itself will no-op when analytics/database is disabled.
    """

    ingestor = ActivityIngestor(settings)
    app.state.activity_ingestor = ingestor
    try:
        await ingestor.start(event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Activity ingestor init failed (ignored)", action="init_activity_ingestor", error=str(exc))


async def close_activity(app: FastAPI, *, event_bus: EventBus) -> None:
    ingestor: ActivityIngestor | None = getattr(app.state, "activity_ingestor", None)
    if ingestor is None:
        return
    try:
        await ingestor.stop(event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Activity ingestor shutdown failed (ignored)", action="close_activity_ingestor", error=str(exc))
