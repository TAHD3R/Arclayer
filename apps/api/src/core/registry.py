import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from enum import StrEnum
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from src.config import Settings, get_settings
from src.core.database.orm import (
    close_orm,
    init_orm,
    verify_db_ready,
)
from src.core.events import events
from src.core.exceptions import init_exception_handlers
from src.core.extensions.manager import ExtensionManager
from src.core.extensions.middleware_dispatcher import TenantAwareExtensionMiddlewareDispatcher
from src.core.extensions.tenant_registry import TenantAwareMiddlewareRegistry
from src.core.extensions.workspace_context_middleware import WorkspaceContextMiddleware
from src.core.logging import configure_logging, get_logger
from src.core.middleware.guard_integration import (
    ArclayerSecurityMiddleware,
    build_guard_config,
    close_guard_runtime,
    initialize_guard_runtime,
)
from src.core.routes import register_platform_routes, register_product_routes
from src.core.runtime_init import (
    close_domain_runtime,
    init_analytics_connector_runtime,
    init_domain_runtime,
)
from src.modules.commerce.provider_configuration import apply_persisted_billing_provider_configuration
from src.platform.cache.valkey import close_valkey, init_valkey

logger = get_logger(__name__)
_FATAL_REGISTRY_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)
_TEST_LOOP_HEARTBEAT_INTERVAL_SECONDS = 0.2


class ApiComposition(StrEnum):
    PRODUCT = "product"
    PLATFORM = "platform"


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


def _resolve_project_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "pnpm-workspace.yaml").is_file() and (parent / "apps" / "api").is_dir():
            return parent
    raise RuntimeError("Unable to resolve Arclayer project root")


async def _init_extension_runtime(app: FastAPI, settings: Settings) -> None:
    """Load, register, bootstrap, and ready all extensions.

    Uses the ExtensionManager already created by AppFactory (if available)
    or creates a new one as a fallback.
    """
    mgr: ExtensionManager | None = getattr(app.state, "extension_manager", None)
    if mgr is None:
        project_root = _resolve_project_root()
        mgr = ExtensionManager(project_root)
        # Platform owns extension inventory and lifecycle without installing
        # Product tenant middleware into the Platform composition root.
        app.state.extension_middleware_registry = mgr.tenant_registries.middlewares
        app.state.extension_manager = mgr

    from src.modules.system.plugins.runtime_reconciliation import (
        load_desired_system_plugins,
        reconcile_plugin_runtime_operations,
    )

    if settings.database.enabled:
        await load_desired_system_plugins(mgr, settings=settings)
    else:
        await mgr.load_all()
    await mgr.register_all(app)
    await mgr.bootstrap_all(app)
    await mgr.ready_all(app)
    await mgr.restore_persisted_activations()
    app.state.plugin_registry = mgr.registry
    app.state.extension_registries = mgr.tenant_registries
    resumed_operations = (
        await reconcile_plugin_runtime_operations(mgr, settings=settings) if settings.database.enabled else 0
    )
    logger.info("Extension runtime initialized", extensions=list(mgr.extension_names))
    if resumed_operations:
        logger.info(
            "Plugin runtime operations resumed after activation verification",
            resumed_operations=resumed_operations,
        )


async def _close_extension_runtime(app: FastAPI) -> None:
    mgr: ExtensionManager | None = getattr(app.state, "extension_manager", None)
    if mgr is None:
        return
    try:
        await mgr.destroy_all()
    finally:
        app.state.extension_manager = None


def _build_lifespan(settings: Settings, composition: ApiComposition):
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
            security = settings.security if composition is ApiComposition.PRODUCT else settings.platform_security
            await initialize_guard_runtime(app, security)

            # In pure unit-test mode we often disable DB/Valkey entirely. In that case we can
            # skip heavyweight startup steps and still exercise routers/middlewares safely.
            if settings.app_env == "test" and not settings.database.enabled and not settings.valkey.enabled:
                await _init_extension_runtime(app, settings)
                if event_bus is None:
                    raise RuntimeError("event_bus unavailable during analytics Connector init")
                await init_analytics_connector_runtime(app, event_bus=event_bus)
                yield
                await _close_extension_runtime(app)
                return

            await init_orm(settings)
            await verify_db_ready(settings)
            await apply_persisted_billing_provider_configuration(settings)
            if settings.database.enabled:
                from src.modules.system.mail.template_defaults import ensure_default_email_templates

                await ensure_default_email_templates()
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
            await _init_extension_runtime(app, settings)
            await init_analytics_connector_runtime(app, event_bus=event_bus)
            yield
        finally:
            await _close_extension_runtime(app)
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
            await close_guard_runtime(app)
            await close_orm()
            await close_valkey(app)

    return lifespan


class AppFactory:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        composition: ApiComposition = ApiComposition.PRODUCT,
    ) -> None:
        self.settings = settings or get_settings()
        self.composition = composition
        self.application_settings = (
            self.settings.application if composition is ApiComposition.PRODUCT else self.settings.platform_application
        )
        self.security_settings = (
            self.settings.security if composition is ApiComposition.PRODUCT else self.settings.platform_security
        )
        # Create ExtensionManager early so the dispatcher middleware gets the
        # correct (same) registry reference that the lifespan will populate.
        if composition is ApiComposition.PLATFORM:
            self._extension_manager = None
            self._extension_middleware_registry = TenantAwareMiddlewareRegistry()
        else:
            try:
                project_root = _resolve_project_root()
                self._extension_manager = ExtensionManager(project_root)
                self._extension_middleware_registry = self._extension_manager.tenant_registries.middlewares
            except RuntimeError:
                self._extension_manager = None
                self._extension_middleware_registry = TenantAwareMiddlewareRegistry()
        self.app = FastAPI(
            debug=False,
            title=self.application_settings.app_name,
            version=self.application_settings.app_version,
            description=self.application_settings.app_description,
            openapi_url=self.application_settings.app_openapi_url if self.settings.enable_docs else None,
            docs_url=None,
            redoc_url=None,
            lifespan=_build_lifespan(self.settings, composition),
        )
        # Store on app.state so the lifespan can populate the registry.
        self.app.state.extension_middleware_registry = self._extension_middleware_registry
        if self._extension_manager is not None:
            self.app.state.extension_manager = self._extension_manager

    def with_logging(self) -> "AppFactory":
        configure_logging(self.settings)
        return self

    def with_middlewares(self) -> "AppFactory":
        from asgi_correlation_id import CorrelationIdMiddleware

        middleware = self.settings.middleware
        security = self.security_settings

        # Order matters: Starlette add_middleware inserts at the front, so the
        # outermost middleware is the one added last. We add them innermost-first
        # so Security ends up outermost.
        if self.composition is ApiComposition.PRODUCT:
            self.app.add_middleware(
                TenantAwareExtensionMiddlewareDispatcher,
                registry=self._extension_middleware_registry,
            )
            self.app.add_middleware(WorkspaceContextMiddleware)

        # Add request logging before CorrelationIdMiddleware. Starlette inserts
        # each new middleware at the front, so CorrelationIdMiddleware will wrap
        # this layer and keep its context available through request finalization.
        from src.core.middleware.request_log import RequestLogMiddleware

        self.app.add_middleware(
            RequestLogMiddleware,
            trace_header_name=self.settings.logging.trace_header_name,
            omit_paths=self.settings.logging.request_log_omit_paths,
            omit_path_prefixes=self.settings.logging.request_log_omit_path_prefixes,
            api_path_prefix=self.application_settings.api_prefix,
            database_enabled=self.settings.database.enabled,
            observability_enabled=self.settings.observability.enabled,
            service_name=self.application_settings.app_name,
            environment=self.settings.app_env,
            release_version=self.application_settings.app_version,
        )

        self.app.add_middleware(CorrelationIdMiddleware)
        from src.core.middleware.locale import LocaleMiddleware

        self.app.add_middleware(LocaleMiddleware)

        if middleware.https_redirect_enabled and self.settings.app_env == "production":
            self.app.add_middleware(HTTPSRedirectMiddleware)

        if middleware.trusted_host_enabled:
            self.app.add_middleware(
                TrustedHostMiddleware,
                allowed_hosts=middleware.trusted_hosts,
                www_redirect=middleware.trusted_host_www_redirect,
            )

        if middleware.gzip_enabled:
            self.app.add_middleware(
                GZipMiddleware,
                minimum_size=middleware.gzip_minimum_size,
                compresslevel=middleware.gzip_compresslevel,
            )

        if security.enabled:
            guard_config = build_guard_config(self.security_settings)
            ArclayerSecurityMiddleware.configure_cors(self.app, guard_config)
            self.app.add_middleware(ArclayerSecurityMiddleware, config=guard_config)

        return self

    def with_exception_handlers(self) -> "AppFactory":
        init_exception_handlers(self.app, self.settings)
        return self

    def with_static(self, *, directory: Path | None = None, url_path: str | None = None) -> "AppFactory":
        if self.composition is ApiComposition.PLATFORM:
            return self
        enabled = self.settings.application.static_enabled
        if not enabled and directory is None and url_path is None:
            return self

        static_dir = Path(directory) if directory is not None else self.settings.application.static_dir
        static_url = url_path or self.settings.application.static_url
        static_dir.mkdir(parents=True, exist_ok=True)
        self.app.mount(static_url, StaticFiles(directory=static_dir), name="static")
        return self

    def build(self) -> FastAPI:
        if self.composition is ApiComposition.PRODUCT:
            register_product_routes(self.app, self.settings)
        else:
            register_platform_routes(self.app, self.settings)
        return self.app


def create_app() -> FastAPI:
    return AppFactory().with_logging().with_middlewares().with_exception_handlers().with_static().build()


def create_platform_app() -> FastAPI:
    return (
        AppFactory(composition=ApiComposition.PLATFORM)
        .with_logging()
        .with_middlewares()
        .with_exception_handlers()
        .build()
    )
