from __future__ import annotations

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.core.logging import get_logger
from apps.api.modules.analytics.ingest import ActivityIngestor
from apps.api.plugin.event_bus import EventBus

logger = get_logger(__name__)


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
    except Exception as exc:
        logger.warning("Activity ingestor init failed (ignored)", error=str(exc))


async def close_activity(app: FastAPI, *, event_bus: EventBus) -> None:
    ingestor: ActivityIngestor | None = getattr(app.state, "activity_ingestor", None)
    if ingestor is None:
        return
    try:
        await ingestor.stop(event_bus=event_bus)
    except Exception as exc:
        logger.warning("Activity ingestor shutdown failed (ignored)", error=str(exc))
