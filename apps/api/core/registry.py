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

from apps.api.config import Settings, get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready
from apps.api.core.database.valkey import close_valkey, init_valkey
from apps.api.core.exceptions import init_exception_handlers
from apps.api.core.limiter import close_rate_limiter, init_rate_limiter
from apps.api.core.logging import configure_logging
from apps.api.core.observability import configure_observability
from apps.api.core.routes import register_routes
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.restart import start_restart_watcher, stop_restart_watcher


def _build_lifespan(settings: Settings, *, plugin_manager: PluginManager):
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if not plugin_manager.descriptors:
            plugin_manager.discover()
        extra_models = plugin_manager.collect_model_modules()

        await init_orm(settings, extra_modules=extra_models)
        await verify_db_ready(settings)
        await init_valkey(app, settings)
        plugin_manager.bind_valkey(getattr(app.state, "valkey", None))
        await init_rate_limiter(app, settings)
        await plugin_manager.sync_records()
        await plugin_manager.start()
        await start_restart_watcher(app, settings)
        app.state.plugin_manager = plugin_manager
        yield
        await stop_restart_watcher(app)
        await plugin_manager.stop()
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
            docs_url=self.settings.application.app_docs_url if self.settings.enable_docs else None,
            redoc_url=self.settings.application.app_redoc_url if self.settings.enable_docs else None,
            default_response_class=ORJSONResponse,
            lifespan=_build_lifespan(self.settings, plugin_manager=self.plugin_manager),
        )

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
        .build()
    )
