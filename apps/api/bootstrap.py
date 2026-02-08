from __future__ import annotations

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.plugin.manager import PluginManager


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
    await register_core_asset_processors(plugin_manager.host.event_bus, settings)

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
    except Exception:
        pass

    # Dev-only bootstrap for Portal SSR integration (do not run in production).
    if settings.app_env != "production":
        from apps.api.modules.sites.bootstrap import ensure_demo_site_ready

        await ensure_demo_site_ready()


async def close_domain_bootstrap(app: FastAPI, *, plugin_manager: PluginManager) -> None:
    """
    Close domain-level background resources started by `init_domain_bootstrap`.
    """

    from apps.api.modules.analytics.bootstrap import close_activity

    try:
        await close_activity(app, event_bus=plugin_manager.host.event_bus)
    except Exception:
        pass
