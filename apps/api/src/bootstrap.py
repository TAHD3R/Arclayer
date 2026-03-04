from __future__ import annotations

import asyncio

from fastapi import FastAPI

from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.plugin.event_bus import EventBus

logger = get_logger(__name__)
_FATAL_BOOTSTRAP_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_BOOTSTRAP_ERRORS):
        raise exc


async def init_domain_bootstrap(app: FastAPI, settings: Settings, *, event_bus: EventBus) -> None:
    """
    Run domain bootstrapping without coupling the core application factory to domain modules.

    This preserves startup behavior while keeping `apps.api.src.core` free from direct
    `apps.api.src.modules.*` imports.
    """

    from apps.api.src.modules.analytics.bootstrap.service import init_activity

    # Start audit log ingestion (best-effort, non-blocking).
    await init_activity(app, settings, event_bus=event_bus)

    from apps.api.src.modules.assets.bootstrap.service import register_core_asset_processors

    # Register core event-driven processors (e.g. thumbnails) after DB is ready.
    await register_core_asset_processors(app, event_bus, settings)

    if not settings.database.enabled:
        return

    from apps.api.src.modules.organization.bootstrap.service import ensure_organization_ready
    from apps.api.src.modules.system.rbac.bootstrap.service import ensure_rbac_ready

    await ensure_organization_ready()
    await ensure_rbac_ready(settings=settings)


async def close_domain_bootstrap(app: FastAPI, *, event_bus: EventBus) -> None:
    """
    Close domain-level background resources started by `init_domain_bootstrap`.
    """

    from apps.api.src.modules.analytics.bootstrap.service import close_activity

    try:
        await close_activity(app, event_bus=event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Activity bootstrap close failed",
            action="close_activity_bootstrap",
            error=str(exc),
        )
