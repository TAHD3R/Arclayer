from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.common.utils.tortoise_protocols import SettingUpdatedBy
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.modules.workspaces.settings.schema import WorkspaceSettingsDetail
from apps.api.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from apps.api.settings.crypto import encrypt_secret, ensure_master_key, is_encrypted, master_key_exists
from apps.api.settings.scopes import SCOPE_TYPE_WORKSPACE
from apps.api.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema


class WorkspaceSettingsService(BaseService):
    """
    Workspace-scoped settings service (v2).

    Currently only supports the core settings namespace.
    """

    async def get_core_detail(self, *, workspace_id: UUID) -> WorkspaceSettingsDetail:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        raw = record.value if record and isinstance(record.value, dict) else {}
        masked, secrets = self._mask_secrets(raw)
        return WorkspaceSettingsDetail(
            namespace=CORE_SETTINGS_NAMESPACE,
            value=masked,
            secrets=secrets,
            updated_at=record.updated_at if record else None,
        )

    async def patch_core(
        self, *, workspace_id: UUID, patch: dict[str, Any], updated_by: UUID | None
    ) -> WorkspaceSettingsDetail:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        current = record.value if record and isinstance(record.value, dict) else {}
        merged = merge_deep(current, patch)

        validate_config_schema(CORE_SETTINGS_SCHEMA, merged, allow_unknown=True)
        merged = await self._encrypt_core_secrets(workspace_id=workspace_id, config=merged)

        if record is None:
            saved = await SettingRecord.create(
                scope_type=SCOPE_TYPE_WORKSPACE,
                scope_id=workspace_id,
                namespace=CORE_SETTINGS_NAMESPACE,
                value=merged or None,
                updated_by=updated_by,
            )
        else:
            record.value = merged or None
            cast(SettingUpdatedBy, record).updated_by = updated_by
            await record.save(update_fields=["value", "updated_by", "updated_at"])
            saved = record

        masked, secrets = self._mask_secrets(merged)
        return WorkspaceSettingsDetail(
            namespace=CORE_SETTINGS_NAMESPACE,
            value=masked,
            secrets=secrets,
            updated_at=saved.updated_at,
        )

    def _mask_secrets(self, config: dict[str, Any]) -> tuple[dict[str, Any], dict[str, bool]]:
        masked: dict[str, Any] = dict(config or {})
        secrets: dict[str, bool] = {}
        for path in iter_secret_field_paths(CORE_SETTINGS_SCHEMA):
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

    async def _encrypt_core_secrets(self, *, workspace_id: UUID, config: dict[str, Any]) -> dict[str, Any]:
        # Only require master key if there are plaintext secret fields to encrypt.
        secret_paths = list(iter_secret_field_paths(CORE_SETTINGS_SCHEMA))
        needs_encrypt = False
        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = config.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None or not isinstance(raw, str) or not raw:
                continue
            if is_encrypted(raw):
                continue
            needs_encrypt = True
            break

        if not needs_encrypt:
            return config

        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(message="系统密钥未初始化", error="MASTER_KEY_MISSING")
        key, _fp = ensure_master_key(key_path)

        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = config.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None or not isinstance(raw, str) or not raw:
                continue
            if is_encrypted(raw):
                continue
            aad = f"{SCOPE_TYPE_WORKSPACE}:{workspace_id}:{CORE_SETTINGS_NAMESPACE}:{path}"
            section[field_key] = encrypt_secret(raw, key=key, aad=aad)
        return config
