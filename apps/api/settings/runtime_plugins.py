from __future__ import annotations

from typing import Any

from apps.api.config import Settings
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.plugin.manifest import ConfigSchema
from apps.api.settings.crypto import decrypt_secret, is_encrypted, load_master_key, master_key_exists
from apps.api.settings.scopes import SCOPE_TYPE_ORG, SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from apps.api.settings.validation import iter_secret_field_paths


async def get_system_plugin_settings_decrypted(
    settings: Settings,
    *,
    plugin_id: str,
    schema: ConfigSchema,
    defaults: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return await get_scoped_plugin_settings_decrypted(
        settings,
        plugin_id=plugin_id,
        schema=schema,
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        defaults=defaults,
    )


async def get_org_plugin_settings_decrypted(
    settings: Settings,
    *,
    organization_id: Any,
    plugin_id: str,
    schema: ConfigSchema,
    defaults: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return await get_scoped_plugin_settings_decrypted(
        settings,
        plugin_id=plugin_id,
        schema=schema,
        scope_type=SCOPE_TYPE_ORG,
        scope_id=organization_id,
        defaults=defaults,
    )


async def get_scoped_plugin_settings_decrypted(
    settings: Settings,
    *,
    plugin_id: str,
    schema: ConfigSchema,
    scope_type: str,
    scope_id: Any,
    defaults: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Load scoped plugin settings (namespace=plugin:<plugin_id>), decrypting secret fields in-memory.

    Notes:
    - Best-effort: when DB isn't ready or record is missing, returns defaults (or {}).
    - Fail-closed: if a field is encrypted but cannot be decrypted, it is returned as None.
    - AAD format must match `SettingsService._encrypt_plugin_secrets`.
    """

    namespace = f"plugin:{plugin_id}"
    base: dict[str, Any] = dict(defaults or {})

    if not settings.database.enabled:
        return base

    try:
        record = await SettingRecord.get_or_none(
            scope_type=scope_type,
            scope_id=scope_id,
            namespace=namespace,
        )
        raw = record.value if record and isinstance(record.value, dict) else None
        if isinstance(raw, dict):
            base = dict(raw)
    except Exception:
        # Best-effort: do not break auth flows if DB is not ready.
        return base

    # Decrypt secret fields (best-effort).
    if master_key_exists(settings.setup.master_key_path):
        try:
            key = load_master_key(settings.setup.master_key_path)
        except Exception:
            key = None
    else:
        key = None

    for path in iter_secret_field_paths(schema):
        section_id, field_key = path.split(".", 1)
        section = base.get(section_id)
        if not isinstance(section, dict):
            continue
        val = section.get(field_key)
        if val is None:
            continue
        if not isinstance(val, str):
            continue
        if not is_encrypted(val):
            # Legacy plaintext secrets could exist; keep them in-memory only.
            continue

        if key is None:
            section[field_key] = None
            continue

        try:
            aad = f"{scope_type}:{scope_id}:{namespace}:{path}"
            section[field_key] = decrypt_secret(val, key=key, aad=aad)
        except Exception:
            section[field_key] = None

    return base


__all__ = [
    "get_org_plugin_settings_decrypted",
    "get_scoped_plugin_settings_decrypted",
    "get_system_plugin_settings_decrypted",
]
