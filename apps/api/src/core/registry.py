import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import HTMLResponse
from starlette.routing import Mount

from src.config import Settings, get_settings
from src.core.database.orm import (
    close_orm,
    init_orm,
    verify_db_ready,
)
from src.core.events import events
from src.core.exceptions import init_exception_handlers
from src.core.logging import configure_logging, get_logger
from src.core.routes import register_routes
from src.core.runtime_init import close_domain_runtime, init_domain_runtime
from src.infra.cache.valkey import close_valkey, init_valkey
from src.infra.jobs.client import close_taskiq_client, init_taskiq_client
from src.infra.limiter.limiter import close_rate_limiter, init_rate_limiter

logger = get_logger(__name__)
_FATAL_REGISTRY_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)
_TEST_LOOP_HEARTBEAT_INTERVAL_SECONDS = 0.2


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_REGISTRY_ERRORS):
        raise exc


async def _test_event_loop_heartbeat() -> None:
    """
    Periodically wake the event loop in unit tests.

    Why:
    - FastAPI runs sync endpoints and some dependencies in a worker thread pool.
    - The worker threads complete by scheduling callbacks via `loop.call_soon_threadsafe(...)`.
    - In some test transports (e.g. httpx ASGITransport) there may be no socket I/O, so the
      event loop can block indefinitely unless it is periodically woken by timers.

    This heartbeat is enabled only in `APP_ENV=test`.
    """

    while True:
        await asyncio.sleep(_TEST_LOOP_HEARTBEAT_INTERVAL_SECONDS)


def _build_lifespan(settings: Settings):
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Make startup/teardown resilient: if any step raises before `yield`,
        # we still want to close DB/cache connections.
        event_bus = None
        heartbeat_task: asyncio.Task[None] | None = None
        try:
            # Starlette's TestClient runs the app in a separate thread with its own event loop.
            # Recreate the shared event runtime in that loop to avoid cross-thread asyncio
            # primitives created at import time.
            if settings.app_env == "test":
                events.reset()
                heartbeat_task = asyncio.create_task(_test_event_loop_heartbeat(), name="test-event-loop-heartbeat")

            event_bus = events.bus
            app.state.event_bus = event_bus

            # In pure unit-test mode we often disable DB/Valkey entirely. In that case we can
            # skip heavyweight startup steps and still exercise routers/middlewares safely.
            if settings.app_env == "test" and not settings.database.enabled and not settings.valkey.enabled:
                yield
                return

            await init_orm(settings)
            await verify_db_ready(settings)
            # Cache "initialized" flag for lightweight request guards.
            try:
                from src.models.organization.user import User

                app.state.system_initialized = await User.all().exists()
            except BaseException as exc:
                _raise_if_fatal(exc)
                logger.warning(
                    "Failed to probe system initialization state", action="probe_system_init", error=str(exc)
                )
                app.state.system_initialized = False

            if event_bus is None:
                raise RuntimeError("event_bus unavailable during domain runtime init")
            await init_domain_runtime(app, settings, event_bus=event_bus)
            await init_valkey(app, settings)
            await init_taskiq_client(app, settings)
            await init_rate_limiter(app, settings)
            yield
        finally:
            if event_bus is not None:
                await close_domain_runtime(app, event_bus=event_bus)
            try:
                if event_bus is not None:
                    await event_bus.aclose()
            except BaseException as exc:
                _raise_if_fatal(exc)
                logger.warning("Event bus close failed", action="close_event_bus", error=str(exc))
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
            await close_rate_limiter(app)
            await close_orm()
            await close_taskiq_client(app)
            await close_valkey(app)

    return lifespan


class AppFactory:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.app = FastAPI(
            debug=self.settings.debug,
            title=self.settings.application.app_name,
            version=self.settings.application.app_version,
            description=self.settings.application.app_description,
            openapi_url=self.settings.application.app_openapi_url if self.settings.enable_docs else None,
            docs_url=None,
            redoc_url=None,
            lifespan=_build_lifespan(self.settings),
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
        repo_static_dir = Path(__file__).resolve().parents[4] / "static" / "spotlight@9.0.6"
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
            allow_origins = middleware.cors_allow_origins
            if middleware.cors_allow_origin_dynamic:
                base_domain = (self.settings.saas.base_domain or "").strip()
                base_domain = base_domain.removeprefix("http://").removeprefix("https://")
                base_domain = base_domain.strip().lstrip(".").rstrip("/")
                scheme = "https" if self.settings.app_env == "production" else "http"
                if base_domain:
                    allow_origins = [f"{scheme}://app.{base_domain}", f"{scheme}://api.{base_domain}"]
            self.app.add_middleware(
                CORSMiddleware,
                allow_origins=allow_origins,
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
            from src.core.middleware.csrf import CSRFMiddleware

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
        from src.core.middleware.locale import LocaleMiddleware

        self.app.add_middleware(LocaleMiddleware)
        from src.core.middleware.request_log import RequestLogMiddleware

        # Place request logging inside CorrelationIdMiddleware so the summary line
        # can reliably include `trace_id` (the correlation middleware may reset contextvars on return).
        self.app.add_middleware(
            RequestLogMiddleware,
            trace_header_name=self.settings.logging.trace_header_name,
            omit_paths=self.settings.logging.request_log_omit_paths,
            omit_path_prefixes=self.settings.logging.request_log_omit_path_prefixes,
        )
        if self.settings.application.deployment_mode == "saas":
            from src.core.middleware.site_resolver import SiteResolverMiddleware

            self.app.add_middleware(SiteResolverMiddleware, settings=self.settings)
        self.app.add_middleware(CorrelationIdMiddleware)

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
        register_routes(self.app, self.settings)
        return self.app


def create_app() -> FastAPI:
    return (
        AppFactory()
        .with_logging()
        .with_middlewares()
        .with_exception_handlers()
        .with_static()
        .with_spotlight_docs()
        .build()
    )
