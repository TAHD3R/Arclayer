from __future__ import annotations

import fnmatch
import pkgutil
from collections.abc import Iterable
from functools import lru_cache
from importlib.util import find_spec
from typing import Final

from tortoise import Tortoise

from apps.api.config import Settings, get_settings
from apps.api.core.logging import logger

EXCLUDE_NAMES = ("tests", "base", "migrations", "__pycache__", "__init__")


def _should_exclude(modname: str, exclude: tuple[str, ...], exclude_globs: tuple[str, ...]) -> bool:
    parts = modname.split(".")
    if exclude and any(p in exclude for p in parts):
        return True
    if exclude_globs and any(fnmatch.fnmatch(modname, pat) for pat in exclude_globs):
        return True
    if any(p.startswith("_") for p in parts):
        return True
    return False


def _is_model_module(modname: str) -> bool:
    return "models" in modname.split(".")


@lru_cache(maxsize=32)
def discover_model_modules(
    base_pkg: str,
    *,
    exclude: tuple[str, ...] = tuple(EXCLUDE_NAMES),
    exclude_globs: tuple[str, ...] = (),
    max_depth: int | None = None,
) -> list[str]:
    results: set[str] = set()

    def walk(pkg_name: str, depth: int) -> None:
        spec = find_spec(pkg_name)
        if spec is None:
            return

        locations = getattr(spec, "submodule_search_locations", None)
        if not locations:
            return

        if max_depth is not None and depth >= max_depth:
            return

        for _, fullname, ispkg in pkgutil.iter_modules(locations, prefix=pkg_name + "."):
            tail = fullname.rsplit(".", 1)[-1]
            if tail.startswith("_"):
                continue
            if _should_exclude(fullname, exclude, exclude_globs):
                continue
            results.add(fullname)
            if ispkg:
                walk(fullname, depth + 1)

    walk(base_pkg, depth=0)
    return sorted(results)


def discover_plugin_models(
    base_pkgs: Iterable[str],
    *,
    exclude: tuple[str, ...] = tuple(EXCLUDE_NAMES),
    exclude_globs: tuple[str, ...] = (),
    max_depth: int | None = None,
) -> list[str]:
    modules: set[str] = set()
    for pkg in base_pkgs:
        for mod in discover_model_modules(pkg, exclude=exclude, exclude_globs=exclude_globs, max_depth=max_depth):
            if _is_model_module(mod):
                modules.add(mod)
    return sorted(modules)


def build_models_list(settings: Settings, *, extra_pkgs: Iterable[str] | None = None) -> list[str]:
    modules = set(settings.database.core_models)
    modules.update(
        discover_plugin_models(
            settings.database.plugin_packages,
            max_depth=settings.database.models_max_depth,
        )
    )
    for pkg in extra_pkgs or []:
        modules.update(discover_model_modules(pkg))
    modules.add("aerich.models")
    return sorted(modules)


def build_tortoise_config(settings: Settings, *, extra_pkgs: Iterable[str] | None = None) -> dict:
    models = build_models_list(settings, extra_pkgs=extra_pkgs)
    logger.debug("Tortoise models", models=models)
    return {
        "connections": {
            "default": {
                "engine": settings.database.engine,
                "credentials": {
                    "host": settings.database.host,
                    "port": settings.database.port,
                    "user": settings.database.user,
                    "password": settings.database.password.get_secret_value(),
                    "database": settings.database.database,
                    "maxsize": settings.database.pool_size,
                },
            }
        },
        "apps": {
            "models": {
                "models": models,
                "default_connection": "default",
            }
        },
        "use_tz": settings.database.use_tz,
        "timezone": settings.database.timezone,
    }


TORTOISE_ORM: Final = build_tortoise_config(get_settings())


async def init_orm(settings: Settings) -> None:
    if not settings.database.enabled:
        logger.info("Database init skipped (disabled)")
        return
    await Tortoise.init(config=build_tortoise_config(settings))


async def close_orm() -> None:
    if Tortoise._inited:
        await Tortoise.close_connections()


async def verify_db_ready(
    settings: Settings,
    *,
    attempts: int = 5,
    base_delay: float = 0.5,
) -> None:
    if not settings.database.enabled:
        return

    import asyncio

    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            await Tortoise.get_connection("default").execute_query("SELECT 1")
            logger.info("Database connectivity OK")
            return
        except Exception as exc:
            last_exc = exc
            await asyncio.sleep(base_delay * attempt)

    raise RuntimeError("Database not ready after retries") from last_exc
