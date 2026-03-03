from __future__ import annotations

import asyncio
import fnmatch
import sys
from collections.abc import Iterable
from functools import lru_cache
from importlib.util import find_spec
from pathlib import Path
from typing import Final

from pydantic import ValidationError
from tortoise import Tortoise

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.logging import get_logger
from apps.api.src.plugin.manifest import load_plugin_manifest

EXCLUDE_NAMES = ("tests", "base", "migrations", "__pycache__", "__init__")

logger = get_logger(__name__)

MANIFEST_PARSE_ERRORS = (OSError, ValidationError)
_FATAL_ORM_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ORM_ERRORS):
        raise exc


def _db_dsn_hint(settings: Settings) -> str:
    user = settings.database.user
    host = settings.database.host
    port = settings.database.port
    database = settings.database.database
    return f"postgresql://{user}@{host}:{port}/{database}"


def _should_exclude(modname: str, exclude: tuple[str, ...], exclude_globs: tuple[str, ...]) -> bool:
    parts = modname.split(".")
    if exclude and any(p in exclude for p in parts):
        return True
    if exclude_globs and any(fnmatch.fnmatch(modname, pat) for pat in exclude_globs):
        return True
    if any(p.startswith("_") for p in parts):
        return True
    return False


def _should_exclude_parts(parts: tuple[str, ...], exclude: tuple[str, ...]) -> bool:
    if exclude and any(p in exclude for p in parts):
        return True
    if any(p.startswith("_") for p in parts):
        return True
    return False


@lru_cache(maxsize=32)
def discover_model_modules(
    base_pkg: str,
    *,
    exclude: tuple[str, ...] = tuple(EXCLUDE_NAMES),
    exclude_globs: tuple[str, ...] = (),
    max_depth: int | None = None,
) -> list[str]:
    spec = find_spec(base_pkg)
    if spec is None:
        return []

    locations = getattr(spec, "submodule_search_locations", None)
    if not locations:
        return []

    root = Path(list(locations)[0])
    results: set[str] = set()

    # Primary model locations:
    # - <base_pkg>.models.* (when base_pkg is a package that contains model directories)
    # - <base_pkg>.* when base_pkg itself is the `models` package
    #
    # We intentionally do NOT require `__init__.py` under `models/` since this repo uses
    # namespace packages (PEP 420), and business directories under `modules/**` forbid
    # non-standard root files like `__init__.py`.
    model_roots = [root] if root.name == "models" else []
    model_roots.extend(sorted([p for p in root.rglob("models") if p.is_dir()]))

    for models_dir in model_roots:
        rel_dir = models_dir.relative_to(root)
        if _should_exclude_parts(rel_dir.parts, exclude):
            continue
        if max_depth is not None and len(rel_dir.parts) > max_depth:
            continue

        for py in models_dir.rglob("*.py"):
            if py.name == "__init__.py":
                continue
            rel_file = py.relative_to(root)
            if _should_exclude_parts(rel_file.parts, exclude):
                continue
            if max_depth is not None and len(rel_file.parts) > max_depth:
                continue
            mod = base_pkg + "." + ".".join(rel_file.with_suffix("").parts)
            if _should_exclude(mod, exclude, exclude_globs):
                continue
            results.add(mod)

    for models_py in root.rglob("models.py"):
        rel = models_py.relative_to(root)
        if _should_exclude_parts(rel.parts, exclude):
            continue
        if max_depth is not None and len(rel.parts) > max_depth:
            continue
        pkg = base_pkg + "." + ".".join(rel.parts[:-1] + ("models",))
        if _should_exclude(pkg, exclude, exclude_globs):
            continue
        results.add(pkg)

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
        modules.update(discover_model_modules(pkg, exclude=exclude, exclude_globs=exclude_globs, max_depth=max_depth))
    return sorted(modules)


def build_models_list(
    settings: Settings,
    *,
    extra_pkgs: Iterable[str] | None = None,
    extra_modules: Iterable[str] | None = None,
) -> list[str]:
    modules: set[str] = set()
    for pkg in settings.database.core_models:
        discovered = discover_model_modules(pkg, max_depth=settings.database.models_max_depth)
        if discovered:
            modules.update(discovered)
        else:
            modules.add(pkg)
    modules.update(
        discover_plugin_models(
            settings.database.plugin_packages,
            max_depth=settings.database.models_max_depth,
        )
    )
    modules.update(_collect_manifest_models(settings))
    for pkg in extra_pkgs or []:
        modules.update(discover_model_modules(pkg))
    for module in extra_modules or []:
        modules.add(module)
    return sorted(modules)


def build_tortoise_config(
    settings: Settings,
    *,
    extra_pkgs: Iterable[str] | None = None,
    extra_modules: Iterable[str] | None = None,
) -> dict:
    models = build_models_list(settings, extra_pkgs=extra_pkgs, extra_modules=extra_modules)

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
                # Tortoise ORM v1+ built-in migrations.
                "migrations": "apps.api.src.migrations",
            }
        },
        "use_tz": settings.database.use_tz,
        "timezone": settings.database.timezone,
    }


def _collect_manifest_models(settings: Settings) -> set[str]:
    if not settings.plugin.enabled:
        return set()

    root_dir = Path(settings.plugin.root_dir)
    if not root_dir.exists():
        return set()

    root_str = str(root_dir)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)

    models: set[str] = set()
    for manifest_path in root_dir.glob("*/plugin.toml"):
        plugin_root = manifest_path.parent
        plugin_root_str = str(plugin_root)
        if plugin_root_str not in sys.path:
            sys.path.insert(0, plugin_root_str)
        src_root = plugin_root / "src"
        if src_root.is_dir():
            src_root_str = str(src_root)
            if src_root_str not in sys.path:
                sys.path.insert(0, src_root_str)
        try:
            manifest = load_plugin_manifest(manifest_path)
        except MANIFEST_PARSE_ERRORS as exc:
            logger.warning("Plugin manifest parse failed", path=str(manifest_path), error=str(exc))
            continue
        for module in manifest.models:
            models.add(module)
    return models


TORTOISE_ORM: Final = build_tortoise_config(get_settings())


async def init_orm(
    settings: Settings,
    *,
    extra_pkgs: Iterable[str] | None = None,
    extra_modules: Iterable[str] | None = None,
) -> None:
    if not settings.database.enabled:
        logger.info("Database init skipped (disabled)")
        return
    try:
        # Enable global fallback context so that DB state is accessible across tasks (e.g. ASGI lifespan
        # task vs. request tasks, and some pytest-asyncio runners).
        await Tortoise.init(
            config=build_tortoise_config(settings, extra_pkgs=extra_pkgs, extra_modules=extra_modules),
            _enable_global_fallback=True,
        )
    except BaseException as exc:
        _raise_if_fatal(exc)
        hint = _db_dsn_hint(settings)
        logger.error("Database init failed", hint=hint, error=repr(exc))
        raise RuntimeError(
            "Database init failed. "
            "Check DATABASE__* settings and connectivity to "
            f"{hint}. Underlying error: {type(exc).__name__}: {exc}"
        ) from exc


async def close_orm() -> None:
    if not Tortoise._inited:
        return
    ctx = Tortoise._get_context()
    # In tests we initialize/teardown Tortoise repeatedly (sometimes across different event loops).
    # Resetting the internal state avoids flaky "Event loop is closed" errors caused by stale
    # connection/app metadata lingering between runs.
    await Tortoise.close_connections()
    try:
        await Tortoise._reset_apps()
    except BaseException as exc:
        _raise_if_fatal(exc)
        # Best-effort: do not mask shutdown errors in production.
        logger.warning("Tortoise app reset failed during close", error=str(exc))

    # Tortoise v1.1+ stores runtime state on a TortoiseContext; `Tortoise._inited` is a classproperty
    # and cannot be assigned. We reset the underlying context instead.
    if ctx is not None:
        try:
            ctx._inited = False
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Tortoise context inited reset failed during close", error=str(exc))
        try:
            ctx.__exit__(None, None, None)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning("Tortoise context exit failed during close", error=str(exc))


async def verify_db_ready(
    settings: Settings,
    *,
    attempts: int = 5,
    base_delay: float = 0.5,
) -> None:
    if not settings.database.enabled:
        return

    hint = _db_dsn_hint(settings)
    last_exc: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            await Tortoise.get_connection("default").execute_query("SELECT 1")
            logger.info("Database connectivity OK")
            return
        except BaseException as exc:
            _raise_if_fatal(exc)
            last_exc = exc
            await asyncio.sleep(base_delay * attempt)

    logger.error("Database not ready after retries", attempts=attempts, hint=hint, error=repr(last_exc))
    raise RuntimeError(
        f"Database not ready after {attempts} retries. "
        f"Check connectivity to {hint}. Underlying error: {type(last_exc).__name__}: {last_exc}"
    ) from last_exc


async def ensure_settings_schema_constraints() -> None:
    """
    Best-effort DB schema hotfix for v2 settings scoping.

    Background:
    - Early migrations created a UNIQUE constraint on `settings.namespace` (Postgres constraint name
      typically `settings_namespace_key`).
    - v2 introduces `(scope_type, scope_id, namespace)` as the unique key, so the legacy constraint
      blocks storing workspace-scoped `core` settings and causes IntegrityError:
        duplicate key value violates unique constraint "settings_namespace_key"

    We do NOT want runtime DDL long-term, but keeping startup resilient is critical for self-host
    deployments and development environments that might not re-run migrations cleanly.
    """

    if not Tortoise._inited:
        return

    conn = Tortoise.get_connection("default")
    sql = """
DO $$
BEGIN
  -- Table may not exist if migrations haven't been applied yet.
  IF to_regclass('public.settings') IS NULL THEN
    RETURN;
  END IF;

  -- Drop the legacy unique constraint on `namespace` if it still exists.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_namespace_key') THEN
    ALTER TABLE "settings" DROP CONSTRAINT "settings_namespace_key";
  END IF;
END $$;
"""
    try:
        await conn.execute_script(sql)
    except BaseException as exc:
        _raise_if_fatal(exc)
        # Best-effort: do not fail app startup if the DB user lacks DDL privileges.
        # In that case, operators must fix constraints via migrations / manual SQL.
        logger.warning("ensure_settings_schema_constraints failed (ignored)", error=str(exc))
