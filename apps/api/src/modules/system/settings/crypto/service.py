from __future__ import annotations

from uuid import UUID

from apps.api.src.config import Settings
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.i18n import t
from apps.api.src.plugin.manifest import ConfigSchema
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.crypto import encrypt_secret, ensure_master_key, is_encrypted, master_key_exists
from apps.api.src.settings.validation import iter_secret_field_paths


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


class SettingsCryptoMixin:
    settings: Settings

    async def _encrypt_core_secrets(self, schema: ConfigSchema, config: dict[str, object]) -> dict[str, object]:
        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=_ts("MASTER_KEY_MISSING", "系统密钥未初始化"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        secret_paths = iter_secret_field_paths(schema)
        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = config.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            aad = f"{CORE_SETTINGS_NAMESPACE}:{path}"
            section[field_key] = encrypt_secret(raw, key=key, aad=aad)

        return config

    async def _encrypt_plugin_secrets(
        self,
        schema: ConfigSchema,
        config: dict[str, object],
        *,
        namespace: str,
        scope_type: str,
        scope_id: UUID,
    ) -> dict[str, object]:
        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=_ts("MASTER_KEY_MISSING", "系统密钥未初始化"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        secret_paths = iter_secret_field_paths(schema)
        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = config.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            aad = f"{scope_type}:{scope_id}:{namespace}:{path}"
            section[field_key] = encrypt_secret(raw, key=key, aad=aad)

        return config

    def _mask_secrets(
        self, schema: ConfigSchema, config: dict[str, object]
    ) -> tuple[dict[str, object], dict[str, bool]]:
        masked: dict[str, object] = dict(config or {})
        secrets: dict[str, bool] = {}

        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = masked.get(section_id)
            if not isinstance(section, dict):
                secrets[path] = False
                continue
            value = section.get(field_key)
            if value is None:
                secrets[path] = False
                continue
            secrets[path] = True
            section[field_key] = None

        return masked, secrets
