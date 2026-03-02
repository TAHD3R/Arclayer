from __future__ import annotations

import asyncio

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.core.logging import get_logger
from apps.api.plugin.manager import PluginManager

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


async def init_domain_bootstrap(app: FastAPI, settings: Settings, *, plugin_manager: PluginManager) -> None:
    """
    Run domain bootstrapping without coupling the core application factory to domain modules.

    This preserves startup behavior while keeping `apps.api.core` free from direct
    `apps.api.modules.*` imports.
    """

    from apps.api.modules.analytics.bootstrap import init_activity

    # Start audit log ingestion (best-effort, non-blocking).
    await init_activity(app, settings, event_bus=plugin_manager.host.event_bus)

    from apps.api.modules.assets.bootstrap import register_core_asset_processors

    # Register core event-driven processors (e.g. thumbnails) after DB is ready.
    await register_core_asset_processors(app, plugin_manager.host.event_bus, settings)

    if not settings.database.enabled:
        return

    from apps.api.modules.organization.bootstrap import ensure_organization_ready
    from apps.api.modules.system.rbac.bootstrap import ensure_rbac_ready

    await ensure_organization_ready()
    await ensure_rbac_ready(settings=settings, plugin_manager=plugin_manager)

    from apps.api.modules.system.admin.menus.bootstrap import ensure_core_admin_menus_ready

    await ensure_core_admin_menus_ready(settings=settings)

    # Best-effort: ensure plugin-declared admin menus exist (create missing, restore deleted).
    try:
        from apps.api.modules.system.admin.menus.seeds import AdminMenuSeedService

        seeder = AdminMenuSeedService(settings)
        if not plugin_manager.descriptors:
            plugin_manager.discover()
        for desc in plugin_manager.descriptors.values():
            seeds = list(getattr(desc.manifest, "admin_menu", None) or [])
            if not seeds:
                continue
            await seeder.ensure_seeds(
                owner_plugin_id=desc.plugin_id,
                seeds=seeds,
                update_existing=False,
                restore_deleted=True,
            )
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Plugin admin menu bootstrap failed",
            action="bootstrap_plugin_admin_menus",
            error=str(exc),
        )


async def close_domain_bootstrap(app: FastAPI, *, plugin_manager: PluginManager) -> None:
    """
    Close domain-level background resources started by `init_domain_bootstrap`.
    """

    from apps.api.modules.analytics.bootstrap import close_activity

    try:
        await close_activity(app, event_bus=plugin_manager.host.event_bus)
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Activity bootstrap close failed",
            action="close_activity_bootstrap",
            error=str(exc),
        )
