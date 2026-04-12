from __future__ import annotations

import binascii
import time

from cryptography.exceptions import InvalidTag
from pydantic import SecretStr
from tortoise.exceptions import OperationalError

from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from apps.api.src.settings.crypto import decrypt_secret, is_encrypted, load_master_key, master_key_exists
from apps.api.src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from apps.api.src.settings.validation import iter_secret_field_paths

logger = get_logger(__name__)
_CORE_SETTINGS_LOAD_ERRORS = (OperationalError, RuntimeError, ValueError, TypeError, OSError)
_CORE_SECRET_DECRYPT_ERRORS = (binascii.Error, RuntimeError, ValueError, TypeError, OSError, UnicodeError, InvalidTag)

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
    - Secrets are decrypted in-memory when possible.
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

        # Decrypt secret fields (best-effort). If we cannot decrypt, keep the encrypted
        # string out of downstream configs by raising an error (debug-first policy).
        decrypted: dict[str, object] = dict(raw)
        if master_key_exists(settings.security.master_key_path):
            key = load_master_key(settings.security.master_key_path)
            for path in iter_secret_field_paths(CORE_SETTINGS_SCHEMA):
                if not path.startswith("storage."):
                    continue
                section_id, field_key = path.split(".", 1)
                section = decrypted.get(section_id)
                if not isinstance(section, dict):
                    continue
                val = section.get(field_key)
                if not isinstance(val, str) or not val:
                    continue
                if not is_encrypted(val):
                    continue
                try:
                    aad = f"{CORE_SETTINGS_NAMESPACE}:{path}"
                    section[field_key] = decrypt_secret(val, key=key, aad=aad)
                except _CORE_SECRET_DECRYPT_ERRORS as exc:
                    logger.warning(
                        "Core settings secret decrypt failed",
                        action="decrypt_core_secret",
                        secret_path=path,
                        error=str(exc),
                    )
                    raise
        else:
            for path in iter_secret_field_paths(CORE_SETTINGS_SCHEMA):
                if not path.startswith("storage."):
                    continue
                section_id, field_key = path.split(".", 1)
                section = decrypted.get(section_id)
                if not isinstance(section, dict):
                    continue
                val = section.get(field_key)
                if isinstance(val, str) and is_encrypted(val):
                    raise RuntimeError("Master key missing: cannot decrypt core storage secret")

        _core_cache = decrypted
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

    updates: dict[str, object] = {}

    # Provider (only accept known values).
    if "provider" in storage_section:
        provider = _safe_str(storage_section.get("provider"))
        if provider in {"local", "s3"}:
            updates["provider"] = provider

    # Public base url is optional; allow explicit None to clear.
    if "public_base_url" in storage_section:
        updates["public_base_url"] = _safe_str(storage_section.get("public_base_url"))

    if "public_delivery_mode" in storage_section:
        mode = _safe_str(storage_section.get("public_delivery_mode"))
        if mode in {"auto", "direct", "presign"}:
            updates["public_delivery_mode"] = mode

    # Upload policy overrides.
    for key in [
        "upload_chunk_size_mb",
        "upload_max_file_size_mb",
        "upload_max_avatar_size_mb",
        "upload_max_site_logo_size_mb",
        "upload_max_favicon_size_mb",
        "s3_presign_expires_seconds",
    ]:
        if key in storage_section:
            v = _safe_int(storage_section.get(key))
            if v is not None:
                updates[key] = v

    # S3 config overrides (allow explicit None).
    for key in [
        "s3_endpoint_url",
        "s3_region",
        "s3_bucket",
        "s3_public_bucket",
        "s3_access_key_id",
    ]:
        if key in storage_section:
            updates[key] = _safe_str(storage_section.get(key))

    if "s3_force_path_style" in storage_section:
        b = _safe_bool(storage_section.get("s3_force_path_style"))
        if b is not None:
            updates["s3_force_path_style"] = b

    if "s3_secret_access_key" in storage_section:
        sec = storage_section.get("s3_secret_access_key")
        if sec is None:
            updates["s3_secret_access_key"] = None
        else:
            s = _safe_str(sec)
            if s is not None:
                updates["s3_secret_access_key"] = SecretStr(s)

    if not updates:
        return settings

    return settings.model_copy(update={"storage": settings.storage.model_copy(update=updates)})
