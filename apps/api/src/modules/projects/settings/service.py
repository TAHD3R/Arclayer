from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from src.common.protocols.tortoise import SettingUpdatedBy
from src.core.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.projects.settings.schema import ProjectSettingsDetail
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from src.settings.scopes import SCOPE_TYPE_PROJECT
from src.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema


class ProjectSettingsService(BaseService):
    """
    Project-scoped settings service.

    Currently supports the core settings namespace.
    """

    async def get_core_detail(self, *, project_id: UUID) -> ProjectSettingsDetail:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_PROJECT,
            scope_id=project_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        raw = record.value if record and isinstance(record.value, dict) else {}
        masked, secrets = self._mask_secrets(raw)
        return ProjectSettingsDetail(
            namespace=CORE_SETTINGS_NAMESPACE,
            value=masked,
            secrets=secrets,
            updated_at=record.updated_at if record else None,
        )

    async def patch_core(
        self,
        *,
        project_id: UUID,
        patch: dict[str, Any],
        updated_by: UUID | None,
    ) -> ProjectSettingsDetail:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_PROJECT,
            scope_id=project_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        current = record.value if record and isinstance(record.value, dict) else {}
        merged = merge_deep(current, patch)

        validate_config_schema(CORE_SETTINGS_SCHEMA, merged, allow_unknown=True)

        if record is None:
            saved = await SettingRecord.create(
                scope_type=SCOPE_TYPE_PROJECT,
                scope_id=project_id,
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
        return ProjectSettingsDetail(
            namespace=CORE_SETTINGS_NAMESPACE,
            value=masked,
            secrets=secrets,
            updated_at=saved.updated_at,
        )

    @staticmethod
    def _mask_secrets(config: dict[str, Any]) -> tuple[dict[str, Any], dict[str, bool]]:
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
