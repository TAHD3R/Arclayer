from __future__ import annotations

from fastapi import APIRouter, FastAPI

from src.config import Settings
from src.modules.assets.router import router as public_assets_router
from src.modules.auth.router import router as auth_router
from src.modules.library.router import router as public_library_router
from src.modules.permissions.router import router as permissions_router
from src.modules.projects.router import router as projects_router
from src.modules.projects.runtime.router import router as content_runtime_router
from src.modules.sites.content_api.router import router as content_sites_router
from src.modules.sites.router import router as sites_router
from src.modules.system.router import router as system_router
from src.modules.tenancy.router import router as tenancy_router
from src.modules.workspaces.router import router as workspaces_router


def _normalize_prefix(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return raw if raw.startswith("/") else f"/{raw}"


def _build_global_api_prefix(settings: Settings) -> str:
    api_prefix = str(settings.application.api_prefix or "").rstrip("/")
    version_prefix = _normalize_prefix(settings.application.api_version_prefix)
    return f"{api_prefix}{version_prefix}"


def _build_content_api_prefix(settings: Settings) -> str:
    content_prefix = str(settings.application.content_api_prefix or "").rstrip("/")
    version_prefix = _normalize_prefix(settings.application.api_version_prefix)
    return f"{content_prefix}{version_prefix}"


def _build_management_api_prefix(settings: Settings) -> str:
    management_prefix = str(settings.application.management_api_prefix or "").rstrip("/")
    version_prefix = _normalize_prefix(settings.application.api_version_prefix)
    return f"{management_prefix}{version_prefix}"


def include_router_with_global_prefix_prepended(
    application: FastAPI,
    router: APIRouter,
    *,
    settings: Settings,
    prefix: str | None = None,
) -> None:
    """
    Register an API router under the shared `/api/v1` surface.

    This keeps the global API prefix decision in one place instead of spreading it
    across an extra aggregation layer.
    """

    global_prefix = _build_global_api_prefix(settings)
    final_prefix = f"{global_prefix}{_normalize_prefix(prefix)}"
    application.include_router(router, prefix=final_prefix)


def include_content_api_router(
    application: FastAPI,
    router: APIRouter,
    *,
    settings: Settings,
    prefix: str | None = None,
) -> None:
    """
    Register a router under the canonical content delivery API surface.
    """

    content_prefix = _build_content_api_prefix(settings)
    final_prefix = f"{content_prefix}{_normalize_prefix(prefix)}"
    application.include_router(router, prefix=final_prefix)


def include_management_api_router(
    application: FastAPI,
    router: APIRouter,
    *,
    settings: Settings,
    prefix: str | None = None,
) -> None:
    """
    Register a router under the reserved programmatic management API surface.
    """

    management_prefix = _build_management_api_prefix(settings)
    final_prefix = f"{management_prefix}{_normalize_prefix(prefix)}"
    application.include_router(router, prefix=final_prefix)


def include_auth_router_with_prefix(
    application: FastAPI,
    *,
    settings: Settings,
) -> None:
    """
    Register authentication endpoints under the canonical `/api/v1/auth` surface.
    """

    include_router_with_global_prefix_prepended(
        application,
        auth_router,
        settings=settings,
        prefix="/auth",
    )


def register_routes(app: FastAPI, settings: Settings) -> None:
    # Static public delivery routes stay outside the versioned JSON API surfaces.
    app.include_router(public_assets_router)
    app.include_router(public_library_router)

    # Content API: runtime content reads, preview reads, GraphQL, site resolution, and sitemap.
    include_content_api_router(app, content_runtime_router, settings=settings)
    include_content_api_router(app, content_sites_router, settings=settings)

    # Admin API: authenticated Admin UI operations and internal control-plane routes.
    include_auth_router_with_prefix(app, settings=settings)
    include_router_with_global_prefix_prepended(app, sites_router, settings=settings)
    include_router_with_global_prefix_prepended(app, system_router, settings=settings, prefix="/system")
    include_router_with_global_prefix_prepended(app, permissions_router, settings=settings, prefix="/permissions")
    include_router_with_global_prefix_prepended(app, tenancy_router, settings=settings, prefix="/tenancy")
    include_router_with_global_prefix_prepended(app, workspaces_router, settings=settings)
    include_router_with_global_prefix_prepended(app, projects_router, settings=settings)
