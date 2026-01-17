from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import ORJSONResponse

from apps.api.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        debug=settings.debug,
        title=settings.application.app_name,
        version=settings.application.app_version,
        description=settings.application.app_description,
        openapi_url=settings.application.app_openapi_url if settings.enable_docs else None,
        docs_url=settings.application.app_docs_url if settings.enable_docs else None,
        redoc_url=settings.application.app_redoc_url if settings.enable_docs else None,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )
    return app
