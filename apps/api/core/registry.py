from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import ORJSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import HTMLResponse
from starlette.routing import Mount

from apps.api.config import Settings, get_settings
from apps.api.core.database.orm import (
    close_orm,
    ensure_settings_schema_constraints,
    init_orm,
    verify_db_ready,
)
from apps.api.core.exceptions import init_exception_handlers
from apps.api.core.logging import configure_logging
from apps.api.core.observability import configure_observability
from apps.api.core.routes import register_routes
from apps.api.infra.cache.valkey import close_valkey, init_valkey
from apps.api.infra.limiter.limiter import close_rate_limiter, init_rate_limiter
from apps.api.modules.analytics.bootstrap import close_activity, init_activity
from apps.api.modules.organization.bootstrap import ensure_organization_ready
from apps.api.modules.sites.bootstrap import ensure_demo_site_ready
from apps.api.modules.system.rbac.bootstrap import ensure_rbac_ready
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.restart import start_restart_watcher, stop_restart_watcher
from apps.api.plugin.watch import start_plugin_watchers, stop_plugin_watchers


def _build_lifespan(settings: Settings, *, plugin_manager: PluginManager):
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Make startup/teardown resilient: if any step raises before `yield`,
        # we still want to close DB/cache connections and stop partially-started plugins.
        try:
            if not plugin_manager.descriptors:
                plugin_manager.discover()
            extra_models = plugin_manager.collect_model_modules()

            await init_orm(settings, extra_modules=extra_models)
            await verify_db_ready(settings)
            # Hotfix legacy DB constraint that blocks v2 workspace-scoped settings.
            await ensure_settings_schema_constraints()
            # Start audit log ingestion (best-effort, non-blocking).
            await init_activity(app, settings, event_bus=plugin_manager.host.event_bus)
            # Register core event-driven processors (e.g. thumbnails) after DB is ready.
            from apps.api.modules.assets.bootstrap import register_core_asset_processors

            await register_core_asset_processors(plugin_manager.host.event_bus, settings)
            if settings.database.enabled:
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
                    await ensure_demo_site_ready()
            await init_valkey(app, settings)
            plugin_manager.bind_valkey(getattr(app.state, "valkey", None))
            await init_rate_limiter(app, settings)
            if settings.database.enabled and settings.plugin.enabled:
                await plugin_manager.sync_records()
                # Migrations may run during sync_records; run the hotfix again to be safe.
                await ensure_settings_schema_constraints()
                await plugin_manager.start()
            await start_plugin_watchers(app, settings, plugin_manager=plugin_manager)
            await start_restart_watcher(app, settings)
            app.state.plugin_manager = plugin_manager
            yield
        finally:
            await stop_restart_watcher(app)
            await stop_plugin_watchers(app)
            await plugin_manager.stop()
            try:
                await close_activity(app, event_bus=plugin_manager.host.event_bus)
            except Exception:
                pass
            try:
                await plugin_manager.host.event_bus.aclose()
            except Exception:
                pass
            await close_rate_limiter(app)
            await close_orm()
            await close_valkey(app)

    return lifespan


class AppFactory:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.plugin_manager = PluginManager(self.settings)
        self.app = FastAPI(
            debug=self.settings.debug,
            title=self.settings.application.app_name,
            version=self.settings.application.app_version,
            description=self.settings.application.app_description,
            openapi_url=self.settings.application.app_openapi_url if self.settings.enable_docs else None,
            # Disable built-in Swagger UI and ReDoc. We serve Stoplight Elements instead.
            docs_url=None,
            redoc_url=None,
            default_response_class=ORJSONResponse,
            lifespan=_build_lifespan(self.settings, plugin_manager=self.plugin_manager),
        )

    def with_spotlight_docs(self) -> "AppFactory":
        """
        Register Stoplight Elements as the only API documentation UI.

        Notes:
        - Only enabled when docs are enabled (development/test).
        - Uses local static assets under `static/spotlight@9.0.6` (no network dependency).
        """

        if not self.settings.enable_docs:
            return self

        # Spotlight assets are bundled with the repository under `/<repo>/static/spotlight@9.0.6`.
        # We mount them under a docs-only path so we don't implicitly enable `/static`
        # when application static serving is disabled.
        repo_static_dir = Path(__file__).resolve().parents[3] / "static" / "spotlight@9.0.6"
        assets_url = "/_docs/spotlight@9.0.6"
        already_mounted = any(isinstance(route, Mount) and route.path == assets_url for route in self.app.routes)
        if not already_mounted:
            repo_static_dir.mkdir(parents=True, exist_ok=True)
            self.app.mount(assets_url, StaticFiles(directory=repo_static_dir), name="spotlight-assets")

        assets_base = assets_url.rstrip("/")
        openapi_url = self.app.openapi_url or self.settings.application.app_openapi_url or "/openapi.json"

        docs_path = self.settings.application.app_docs_url or "/docs"

        @self.app.get(docs_path, include_in_schema=False)
        async def spotlight_docs() -> HTMLResponse:
            # Minimal HTML wrapper for Stoplight Elements. Keep it dependency-free.
            html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{self.app.title} - Spotlight API Documentation</title>
    <link rel="stylesheet" href="{assets_base}/styles.min.css" />
    <script src="{assets_base}/web-components.min.js"></script>
  </head>
  <body>
    <elements-api apiDescriptionUrl="{openapi_url}" router="hash"></elements-api>
  </body>
</html>"""
            return HTMLResponse(content=html)

        # Backward-compatible alias for existing links.
        if docs_path != "/spotlight":
            from starlette.responses import RedirectResponse

            @self.app.get("/spotlight", include_in_schema=False)
            async def spotlight_docs_alias() -> RedirectResponse:
                return RedirectResponse(url=docs_path)

        return self

    def with_logging(self) -> "AppFactory":
        configure_logging(self.settings)
        return self

    def with_middlewares(self) -> "AppFactory":
        from asgi_correlation_id import CorrelationIdMiddleware

        middleware = self.settings.middleware

        if middleware.cors_enabled:
            self.app.add_middleware(
                CORSMiddleware,
                allow_origins=middleware.cors_allow_origins,
                allow_methods=middleware.cors_allow_methods,
                allow_headers=middleware.cors_allow_headers,
                allow_credentials=middleware.cors_allow_credentials,
                allow_origin_regex=middleware.cors_allow_origin_regex,
                expose_headers=middleware.cors_expose_headers,
                max_age=middleware.cors_max_age,
            )

        if middleware.gzip_enabled:
            self.app.add_middleware(
                GZipMiddleware,
                minimum_size=middleware.gzip_minimum_size,
                compresslevel=middleware.gzip_compresslevel,
            )

        if middleware.trusted_host_enabled:
            self.app.add_middleware(
                TrustedHostMiddleware,
                allowed_hosts=middleware.trusted_hosts,
                www_redirect=middleware.trusted_host_www_redirect,
            )

        if middleware.https_redirect_enabled and self.settings.app_env == "production":
            self.app.add_middleware(HTTPSRedirectMiddleware)

        if middleware.csrf_enabled:
            from apps.api.core.middleware.csrf import CSRFMiddleware

            self.app.add_middleware(
                CSRFMiddleware,
                header_name=middleware.csrf_header_name,
                cookie_name=middleware.csrf_cookie_name,
                safe_methods=middleware.csrf_safe_methods,
                cookie_secure=middleware.csrf_cookie_secure,
                cookie_httponly=middleware.csrf_cookie_httponly,
                cookie_samesite=middleware.csrf_cookie_samesite,
                token_bytes=middleware.csrf_token_bytes,
            )

        from apps.api.modules.system.middleware.locale import LocaleMiddleware

        self.app.add_middleware(LocaleMiddleware)
        from apps.api.core.middleware.request_log import RequestLogMiddleware

        # Place request logging inside CorrelationIdMiddleware so the summary line
        # can reliably include `trace_id` (the correlation middleware may reset contextvars on return).
        self.app.add_middleware(
            RequestLogMiddleware,
            trace_header_name=self.settings.logging.trace_header_name,
            omit_paths=self.settings.logging.request_log_omit_paths,
            omit_path_prefixes=self.settings.logging.request_log_omit_path_prefixes,
        )
        self.app.add_middleware(CorrelationIdMiddleware)

        return self

    def with_observability(self) -> "AppFactory":
        configure_observability(self.app, self.settings)
        return self

    def with_exception_handlers(self) -> "AppFactory":
        init_exception_handlers(self.app, self.settings)
        return self

    def with_static(self, *, directory: Path | None = None, url_path: str | None = None) -> "AppFactory":
        enabled = self.settings.application.static_enabled
        if not enabled and directory is None and url_path is None:
            return self

        static_dir = Path(directory) if directory is not None else self.settings.application.static_dir
        static_url = url_path or self.settings.application.static_url
        static_dir.mkdir(parents=True, exist_ok=True)
        self.app.mount(static_url, StaticFiles(directory=static_dir), name="static")
        return self

    def build(self) -> FastAPI:
        register_routes(self.app, self.settings, plugin_manager=self.plugin_manager)
        return self.app


def create_app() -> FastAPI:
    return (
        AppFactory()
        .with_logging()
        .with_observability()
        .with_middlewares()
        .with_exception_handlers()
        .with_static()
        .with_spotlight_docs()
        .build()
    )
