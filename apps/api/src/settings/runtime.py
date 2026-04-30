from __future__ import annotations

import time
from typing import Any, cast

from tortoise.exceptions import OperationalError

from src.config import Settings
from src.core.logging import get_logger
from src.models.system.setting import SettingRecord
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

logger = get_logger(__name__)
_CORE_SETTINGS_LOAD_ERRORS = (OperationalError, RuntimeError, ValueError, TypeError, OSError)

# Per-process cache (each worker has its own memory space).
_core_cache: dict[str, object] | None = None
_core_cache_expires_at: float = 0.0


def invalidate_core_settings_cache() -> None:
    """
    Invalidate the in-process core settings cache.

    Notes:
    - This is per-worker memory only (does not fan out across processes).
    - Call it after any endpoint that mutates system-scoped core settings so runtime
      overlays pick up changes immediately.
    """

    global _core_cache, _core_cache_expires_at
    _core_cache = None
    _core_cache_expires_at = 0.0


def _safe_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _safe_bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    return None


def _safe_str(value: object) -> str | None:
    if isinstance(value, str):
        return value
    return None


async def get_core_settings_value_cached(
    settings: Settings,
    *,
    ttl_seconds: float = 5.0,
) -> dict[str, object]:
    """
    Load core settings value from DB, with a small per-process TTL cache.

    Notes:
    - Best-effort: if DB is not ready, returns {}.
    - Secret fields are stored in the same JSON payload but are still masked before being
      returned from admin settings APIs.
    """

    global _core_cache, _core_cache_expires_at

    now = time.monotonic()
    if _core_cache is not None and _core_cache_expires_at > now:
        return _core_cache

    if not settings.database.enabled:
        _core_cache = {}
        _core_cache_expires_at = now + ttl_seconds
        return _core_cache

    try:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        raw = record.value if record and isinstance(record.value, dict) else {}

        _core_cache = dict(raw)
        _core_cache_expires_at = now + ttl_seconds
        return _core_cache
    except _CORE_SETTINGS_LOAD_ERRORS as exc:
        logger.warning(
            "Core settings load failed",
            action="load_core_settings_runtime",
            error=str(exc),
        )
        raise


async def get_effective_settings(settings: Settings) -> Settings:
    """
    Build an "effective" Settings instance by overlaying core settings (DB) onto env Settings.

    Current scope:
    - Only `storage.*` is applied (admin-configurable).
    - Deployment-level paths (local_root_dir/local_tmp_dir) remain env-driven.
    """

    core = await get_core_settings_value_cached(settings)
    storage_section = core.get("storage") if isinstance(core, dict) else None
    if not isinstance(storage_section, dict):
        return settings
    storage = cast(dict[str, Any], storage_section)

    updates: dict[str, object] = {}

    if "default_profile_key" in storage:
        default_profile_key = _safe_str(storage.get("default_profile_key"))
        if default_profile_key:
            updates["default_profile_key"] = default_profile_key

    # Upload policy overrides.
    for key in [
        "upload_chunk_size_mb",
        "upload_max_file_size_mb",
        "upload_max_avatar_size_mb",
        "upload_max_site_logo_size_mb",
        "upload_max_favicon_size_mb",
        "upload_session_ttl_seconds",
        "recycle_bin_retention_days",
    ]:
        if key in storage:
            v = _safe_int(storage.get(key))
            if v is not None:
                updates[key] = v

    if not updates:
        return settings

    return settings.model_copy(update={"storage": settings.storage.model_copy(update=updates)})
