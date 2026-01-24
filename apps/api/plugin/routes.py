from __future__ import annotations

import importlib
import re
from collections.abc import Iterable

from fastapi import APIRouter, Depends

from apps.api.core.authz import require_permission_strict
from apps.api.core.logging import get_logger
from apps.api.plugin.deps import require_plugin_enabled
from apps.api.plugin.manager import PluginManager

logger = get_logger(__name__)
_CELESTIAL_PREFIX = "com.celestial."
_RESERVED_PLUGIN_PATHS = frozenset({"install"})


def register_plugin_routers(router: APIRouter, *, plugin_manager: PluginManager) -> None:
    if not plugin_manager.descriptors:
        plugin_manager.discover()

    alias_owner: dict[str, str] = {}
    for descriptor in plugin_manager.descriptors.values():
        plugin_id = descriptor.plugin_id
        alias = _derive_plugin_alias(plugin_id)
        if alias:
            existing = alias_owner.get(alias)
            if existing and existing != plugin_id:
                logger.warning(
                    "Plugin alias collision, skip alias route",
                    alias=alias,
                    plugin_id=plugin_id,
                    existing_plugin_id=existing,
                )
                alias = None
            else:
                alias_owner[alias] = plugin_id

        for scope, subrouter in _load_plugin_routers(descriptor.entrypoint):
            prefixes = _build_plugin_prefixes(plugin_id, alias=alias, scope=scope)
            include_tags = None if subrouter.tags else [f"plugin:{plugin_id}"]
            dependencies = [Depends(require_plugin_enabled(plugin_id))]
            if scope == "admin":
                dependencies.append(require_permission_strict("admin:access"))
            for prefix in prefixes:
                router.include_router(
                    subrouter,
                    prefix=prefix,
                    dependencies=dependencies,
                    tags=include_tags,
                )


def _build_plugin_prefixes(plugin_id: str, *, alias: str | None, scope: str) -> list[str]:
    if scope == "admin":
        base = f"/admin/plugins/{plugin_id}"
        prefixes = [base]
        if alias and alias != plugin_id:
            prefixes.append(f"/admin/plugins/{alias}")
        return prefixes
    base = f"/plugins/{plugin_id}"
    prefixes = [base]
    if alias and alias != plugin_id:
        prefixes.append(f"/plugins/{alias}")
    return prefixes


def _derive_plugin_alias(plugin_id: str) -> str | None:
    """
    Derive a short path alias for a plugin id.

    Examples:
    - com.celestial.org.tools -> org-tools
    - com.celestial.rbac.core -> rbac-core
    - vendor.my.plugin -> vendor-my-plugin
    """

    raw = (plugin_id or "").strip()
    if not raw:
        return None
    base = raw[len(_CELESTIAL_PREFIX) :] if raw.startswith(_CELESTIAL_PREFIX) else raw
    alias = base.replace(".", "-").strip("-")
    alias = re.sub(r"[^A-Za-z0-9_-]+", "-", alias).strip("-")
    if not alias or alias in _RESERVED_PLUGIN_PATHS:
        return None
    return alias


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
