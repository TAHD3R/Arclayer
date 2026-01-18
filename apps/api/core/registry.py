from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import ORJSONResponse
from fastapi.staticfiles import StaticFiles

from apps.api.config import Settings, get_settings
from apps.api.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield


class AppFactory:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.app = FastAPI(
            debug=self.settings.debug,
            title=self.settings.application.app_name,
            version=self.settings.application.app_version,
            description=self.settings.application.app_description,
            openapi_url=self.settings.application.app_openapi_url if self.settings.enable_docs else None,
            docs_url=self.settings.application.app_docs_url if self.settings.enable_docs else None,
            redoc_url=self.settings.application.app_redoc_url if self.settings.enable_docs else None,
            default_response_class=ORJSONResponse,
            lifespan=lifespan,
        )

    def with_logging(self) -> "AppFactory":
        configure_logging(self.settings)
        return self

    def with_middlewares(self) -> "AppFactory":
        from asgi_correlation_id import CorrelationIdMiddleware

        self.app.add_middleware(CorrelationIdMiddleware)

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
        return self.app


def create_app() -> FastAPI:
    return AppFactory().with_logging().with_middlewares().with_static().build()
