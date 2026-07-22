from __future__ import annotations

import asyncio
import fnmatch
from collections.abc import Iterable
from functools import lru_cache
from importlib.util import find_spec
from pathlib import Path
from typing import Final

from tortoise import Tortoise
from tortoise.context import TortoiseContext

from src.config import Settings, get_settings
from src.core.logging import get_logger

EXCLUDE_NAMES = ("tests", "base", "migrations", "__pycache__", "__init__")

logger = get_logger(__name__)

_orm_lifecycle_config: dict | None = None
_orm_lifecycle_context: TortoiseContext | None = None
_orm_lifecycle_lock: asyncio.Lock | None = None
_orm_lifecycle_loop: asyncio.AbstractEventLoop | None = None
_orm_lifecycle_refcount = 0

_FATAL_ORM_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ORM_ERRORS):
        raise exc


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


def _is_importable_package(pkg: str) -> bool:
    spec = find_spec(pkg)
    if spec is None:
        return False
    locations = getattr(spec, "submodule_search_locations", None)
    return bool(locations)


_PRIMARY_CORE_MODELS_PKG: Final[str] = "src.models"
_ALWAYS_INCLUDED_MODEL_MODULES: Final[tuple[str, ...]] = ("src.models.tenancy.workspace_tenant",)
_KNOWN_NON_MODEL_MODULES: Final[frozenset[str]] = frozenset({"src.models.agents.conversation"})
_LEGACY_CORE_MODELS_PKGS: Final[tuple[str, ...]] = (
    # Legacy pre-refactor paths often referenced `modules` as the model package.
    "src.modules",
)


def _normalize_core_model_pkgs(pkgs: Iterable[str]) -> list[str]:
    return list(_normalize_core_model_pkgs_cached(tuple(str(p or "") for p in pkgs)))


@lru_cache(maxsize=32)
def _normalize_core_model_pkgs_cached(pkgs: tuple[str, ...]) -> tuple[str, ...]:
    """
    Normalize core model discovery packages.

    Goals:
    - Ensure ORM models under `src.models` are always discoverable, even if
      local dotenv files contain legacy `DATABASE__CORE_MODELS` values.
    - Avoid passing packages that contain no models (e.g. `src.modules`) to
      Tortoise, which triggers noisy "has no models" warnings.
    """

    seen: set[str] = set()
    out: list[str] = []

    for raw in pkgs:
        pkg = str(raw or "").strip()
        if not pkg:
            continue
        if ".src." in pkg and not pkg.startswith("src."):
            pkg = pkg[pkg.index("src.") :]
        if pkg in _LEGACY_CORE_MODELS_PKGS:
            continue
        if pkg in seen:
            continue
        seen.add(pkg)
        out.append(pkg)

    if _PRIMARY_CORE_MODELS_PKG not in seen:
        logger.warning(
            "DATABASE__CORE_MODELS missing primary models package; adding it automatically",
            action="db_core_models_normalize",
            required=_PRIMARY_CORE_MODELS_PKG,
            provided=list(out),
        )
        out.insert(0, _PRIMARY_CORE_MODELS_PKG)

    return tuple(out)


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
            if mod in _KNOWN_NON_MODEL_MODULES:
                continue
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


def build_models_list(
    settings: Settings,
    *,
    extra_pkgs: Iterable[str] | None = None,
    extra_modules: Iterable[str] | None = None,
) -> list[str]:
    modules: set[str] = set(_ALWAYS_INCLUDED_MODEL_MODULES)
    for pkg in _normalize_core_model_pkgs(settings.database.core_models):
        if not _is_importable_package(pkg):
            logger.warning(
                "DATABASE__CORE_MODELS contains non-package entry; ignoring",
                action="db_core_models_invalid_entry",
                entry=pkg,
            )
            continue
        discovered = discover_model_modules(pkg, max_depth=settings.database.models_max_depth)
        if discovered:
            modules.update(discovered)
        else:
            logger.warning(
                "No ORM model modules discovered under DATABASE__CORE_MODELS entry; ignoring",
                action="db_core_models_no_models",
                entry=pkg,
            )
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
                "migrations": "src.migrations",
            }
        },
        "use_tz": settings.database.use_tz,
        "timezone": settings.database.timezone,
    }


TORTOISE_ORM: Final = build_tortoise_config(get_settings())


def _lifecycle_lock_for_current_loop() -> asyncio.Lock:
    global _orm_lifecycle_lock, _orm_lifecycle_loop

    loop = asyncio.get_running_loop()
    lock = _orm_lifecycle_lock
    if lock is None:
        lock = asyncio.Lock()
        _orm_lifecycle_lock = lock
        _orm_lifecycle_loop = loop
        return lock
    if _orm_lifecycle_loop is loop:
        return lock
    if _orm_lifecycle_refcount > 0 or lock.locked():
        raise RuntimeError("ORM lifecycle cannot move across event loops while initialization is active")
    lock = asyncio.Lock()
    _orm_lifecycle_lock = lock
    _orm_lifecycle_loop = loop
    return lock


async def init_orm(
    settings: Settings,
    *,
    extra_pkgs: Iterable[str] | None = None,
    extra_modules: Iterable[str] | None = None,
) -> None:
    if not settings.database.enabled:
        logger.info("Database init skipped (disabled)")
        return
    async with _lifecycle_lock_for_current_loop():
        config = build_tortoise_config(
            settings,
            extra_pkgs=extra_pkgs,
            extra_modules=extra_modules,
        )
        if _orm_lifecycle_refcount > 0:
            _acquire_existing_orm(config)
            return
        await _initialize_orm(settings=settings, config=config)


def _acquire_existing_orm(config: dict) -> None:
    global _orm_lifecycle_refcount

    active_context = Tortoise._get_context()
    owned_context = _orm_lifecycle_context
    if owned_context is None or active_context is not owned_context or not owned_context.inited:
        raise RuntimeError("ORM lifecycle ownership differs from the active Tortoise context")
    if config != _orm_lifecycle_config:
        raise RuntimeError("ORM is already initialized with a different database configuration")
    _orm_lifecycle_refcount += 1


async def _initialize_orm(*, settings: Settings, config: dict) -> None:
    global _orm_lifecycle_config, _orm_lifecycle_context, _orm_lifecycle_refcount

    if Tortoise._get_context() is not None:
        raise RuntimeError("Tortoise is initialized outside the owned ORM lifecycle")
    try:
        # Enable global fallback context so that DB state is accessible across tasks (e.g. ASGI lifespan
        # task vs. request tasks, and some pytest-asyncio runners).
        ctx = await Tortoise.init(
            config=config,
            _enable_global_fallback=True,
        )
        # Tortoise.init() enters a ContextVar-backed context whose token can only be reset by the
        # asyncio Context that created it. Process lifecycles such as Taskiq may run startup and
        # shutdown hooks in different tasks, so detach the local context here and keep only the
        # library-supported global fallback used for cross-task access.
        ctx.__exit__(None, None, None)
        _orm_lifecycle_config = config
        _orm_lifecycle_context = ctx
        _orm_lifecycle_refcount = 1
    except BaseException as exc:
        _raise_if_fatal(exc)
        hint = settings.database.dsn_async_hint
        logger.error("Database init failed", hint=hint, error=repr(exc))
        raise RuntimeError(
            "Database init failed. "
            "Check DATABASE__* settings and connectivity to "
            f"{hint}. Underlying error: {type(exc).__name__}: {exc}"
        ) from exc


async def close_orm() -> None:
    async with _lifecycle_lock_for_current_loop():
        await _close_owned_orm()


async def _close_owned_orm() -> None:
    global _orm_lifecycle_config, _orm_lifecycle_context, _orm_lifecycle_refcount

    if _orm_lifecycle_refcount == 0:
        if Tortoise._get_context() is not None:
            raise RuntimeError("Tortoise is initialized outside the owned ORM lifecycle")
        return
    ctx = Tortoise._get_context()
    owned_context = _orm_lifecycle_context
    if owned_context is None or ctx is not owned_context or not owned_context.inited:
        raise RuntimeError("ORM lifecycle ownership differs from the active Tortoise context")
    _orm_lifecycle_refcount -= 1
    if _orm_lifecycle_refcount > 0:
        return

    # Reset model metadata while the global fallback still exposes this context. Closing the
    # connections clears that fallback, so reversing this order leaves the app registry stale.
    try:
        await Tortoise._reset_apps()
    finally:
        try:
            await Tortoise.close_connections()
            ctx._inited = False
        finally:
            _orm_lifecycle_config = None
            _orm_lifecycle_context = None


async def verify_db_ready(
    settings: Settings,
    *,
    attempts: int = 5,
    base_delay: float = 0.5,
) -> None:
    if not settings.database.enabled:
        return

    hint: str = settings.database.dsn_async_hint
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
