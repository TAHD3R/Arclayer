from __future__ import annotations

import binascii
from uuid import UUID

from cryptography.exceptions import InvalidTag
from tortoise.exceptions import OperationalError

from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.plugin.manifest import ConfigSchema
from apps.api.src.settings.crypto import decrypt_secret, is_encrypted, load_master_key, master_key_exists
from apps.api.src.settings.scopes import SCOPE_TYPE_ORG, SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from apps.api.src.settings.validation import iter_secret_field_paths

logger = get_logger(__name__)
_SCOPED_PLUGIN_SETTINGS_LOAD_ERRORS = (OperationalError, RuntimeError, ValueError, TypeError, OSError)
_MASTER_KEY_LOAD_ERRORS = (binascii.Error, RuntimeError, ValueError, TypeError, OSError, UnicodeError)
_SECRET_DECRYPT_ERRORS = (binascii.Error, RuntimeError, ValueError, TypeError, OSError, UnicodeError, InvalidTag)


async def get_system_plugin_settings_decrypted(
    settings: Settings,
    *,
    plugin_id: str,
    schema: ConfigSchema,
    defaults: dict[str, object] | None = None,
) -> dict[str, object]:
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
    organization_id: UUID,
    plugin_id: str,
    schema: ConfigSchema,
    defaults: dict[str, object] | None = None,
) -> dict[str, object]:
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
    scope_id: UUID,
    defaults: dict[str, object] | None = None,
) -> dict[str, object]:
    """
    Load scoped plugin settings (namespace=plugin:<plugin_id>), decrypting secret fields in-memory.

    Notes:
    - Best-effort: when DB isn't ready or record is missing, returns defaults (or {}).
    - Fail-closed: if a field is encrypted but cannot be decrypted, it is returned as None.
    - AAD format must match `SettingsService._encrypt_plugin_secrets`.
    """

    namespace = f"plugin:{plugin_id}"
    base: dict[str, object] = dict(defaults or {})

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
    except _SCOPED_PLUGIN_SETTINGS_LOAD_ERRORS as exc:
        logger.warning(
            "Plugin scoped settings load failed",
            action="load_scoped_plugin_settings",
            plugin_id=plugin_id,
            scope_type=scope_type,
            scope_id=str(scope_id),
            error=str(exc),
        )
        raise

    # Decrypt secret fields (best-effort).
    if master_key_exists(settings.setup.master_key_path):
        try:
            key = load_master_key(settings.setup.master_key_path)
        except _MASTER_KEY_LOAD_ERRORS as exc:
            logger.warning(
                "Plugin settings master key load failed",
                action="load_plugin_master_key",
                plugin_id=plugin_id,
                scope_type=scope_type,
                scope_id=str(scope_id),
                error=str(exc),
            )
            raise
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
            raise RuntimeError("Master key missing: cannot decrypt plugin secret")

        try:
            aad = f"{scope_type}:{scope_id}:{namespace}:{path}"
            section[field_key] = decrypt_secret(val, key=key, aad=aad)
        except _SECRET_DECRYPT_ERRORS as exc:
            logger.warning(
                "Plugin settings secret decrypt failed",
                action="decrypt_plugin_secret",
                plugin_id=plugin_id,
                scope_type=scope_type,
                scope_id=str(scope_id),
                secret_path=path,
                error=str(exc),
            )
            raise

    return base


__all__ = [
    "get_org_plugin_settings_decrypted",
    "get_scoped_plugin_settings_decrypted",
    "get_system_plugin_settings_decrypted",
]
