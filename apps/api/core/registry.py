from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import ORJSONResponse

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

    def build(self) -> FastAPI:
        return self.app


def create_app() -> FastAPI:
    return AppFactory().with_logging().with_middlewares().build()
