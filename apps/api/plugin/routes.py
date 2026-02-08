from __future__ import annotations

import asyncio
import importlib
from collections.abc import Iterable
from enum import Enum
from typing import cast

from fastapi import APIRouter, Depends

from apps.api.core.logging import get_logger
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.deps import require_workspace_manage_access
from apps.api.plugin.deps import require_plugin_enabled
from apps.api.plugin.manager import PluginManager

logger = get_logger(__name__)
_FATAL_PLUGIN_ROUTE_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_PLUGIN_ROUTE_ERRORS):
        raise exc


def register_plugin_routers(router: APIRouter, *, plugin_manager: PluginManager) -> None:
    """
    Register plugin routers under stable slug-based paths.

    - Admin scope:  /workspaces/{workspace_id}/plugins/{slug}/...
    - Public scope: /plugins/{slug}/...
    """

    if not plugin_manager.descriptors:
        plugin_manager.discover()

    for descriptor in plugin_manager.descriptors.values():
        plugin_id = descriptor.plugin_id
        slug = descriptor.manifest.plugin.slug

        for scope, subrouter in _load_plugin_routers(descriptor.entrypoint):
            prefix = _build_plugin_prefix(slug, scope=scope)
            # FastAPI's type hint expects `list[str | Enum]`, but `list[str]` is invariant.
            tag = cast(str | Enum, f"plugin:{plugin_id}")
            include_tags: list[str | Enum] | None = None if subrouter.tags else [tag]
            dependencies = [
                Depends(
                    require_plugin_enabled(
                        plugin_id,
                        management_scope=descriptor.manifest.plugin.management_scope,
                    )
                )
            ]
            if scope == "admin":
                dependencies.append(Depends(require_workspace_manage_access))
                dependencies.append(require_workspace_permission("admin:access"))
            router.include_router(
                subrouter,
                prefix=prefix,
                dependencies=dependencies,
                tags=include_tags,
            )


def _build_plugin_prefix(slug: str, *, scope: str) -> str:
    if scope == "admin":
        return f"/workspaces/{{workspace_id}}/plugins/{slug}"
    return f"/plugins/{slug}"


def _load_plugin_routers(entrypoint: str) -> Iterable[tuple[str, APIRouter]]:
    module_name = entrypoint.split(":", 1)[0]
    root = module_name.split(".", 1)[0]
    try:
        module = importlib.import_module(f"{root}.routers")
    except ModuleNotFoundError:
        return []
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning("Plugin router import failed", entrypoint=entrypoint, action="load_plugin_routers", error=str(exc))
        return []

    routers: list[tuple[str, APIRouter]] = []
    public_router = getattr(module, "public_router", None)
    if isinstance(public_router, APIRouter):
        routers.append(("public", public_router))
    admin_router = getattr(module, "admin_router", None)
    if isinstance(admin_router, APIRouter):
        routers.append(("admin", admin_router))
    return routers
