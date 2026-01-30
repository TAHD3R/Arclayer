from __future__ import annotations

import importlib
from collections.abc import Iterable
from enum import Enum
from typing import cast

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.core.logging import get_logger
from apps.api.plugin.deps import require_plugin_enabled
from apps.api.plugin.manager import PluginManager

logger = get_logger(__name__)


def register_plugin_routers(router: APIRouter, *, plugin_manager: PluginManager) -> None:
    """
    Register plugin routers under stable slug-based paths.

    - Admin scope:  /admin/plugins/{slug}/...
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
            dependencies = [Depends(require_plugin_enabled(plugin_id))]
            if scope == "admin":
                dependencies.append(require_permission_strict("admin:access"))
            router.include_router(
                subrouter,
                prefix=prefix,
                dependencies=dependencies,
                tags=include_tags,
            )


def _build_plugin_prefix(slug: str, *, scope: str) -> str:
    if scope == "admin":
        return f"/admin/plugins/{slug}"
    return f"/plugins/{slug}"


def _load_plugin_routers(entrypoint: str) -> Iterable[tuple[str, APIRouter]]:
    module_name = entrypoint.split(":", 1)[0]
    root = module_name.split(".", 1)[0]
    try:
        module = importlib.import_module(f"{root}.routers")
    except ModuleNotFoundError:
        return []
    except Exception as exc:
        logger.warning("Plugin router import failed", entrypoint=entrypoint, error=str(exc))
        return []

    routers: list[tuple[str, APIRouter]] = []
    public_router = getattr(module, "public_router", None)
    if isinstance(public_router, APIRouter):
        routers.append(("public", public_router))
    admin_router = getattr(module, "admin_router", None)
    if isinstance(admin_router, APIRouter):
        routers.append(("admin", admin_router))
    return routers
