from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from src.common.protocols.tortoise import SettingUpdatedBy
from src.common.types.json_types import JsonObject
from src.core.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.settings.schema import ProjectSettingsDetail
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from src.settings.scopes import SCOPE_TYPE_PROJECT
from src.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema

PROJECT_SETTINGS_UPDATED_EVENT = "project.settings.updated"


class ProjectSettingsService(BaseService):
    """
    Project-scoped settings service.

    Currently supports the core settings namespace.
    """

    async def _write_settings_activity_event(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        changed_paths: list[str],
        contains_sensitive_values: bool,
        conn,
    ) -> None:
        properties: JsonObject = {
            "project_id": str(project_id),
            "actor_user_id": str(actor_user_id),
            "namespace": CORE_SETTINGS_NAMESPACE,
            "paths": changed_paths,
            "contains_sensitive_values": contains_sensitive_values,
        }
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=PROJECT_SETTINGS_UPDATED_EVENT,
                actor_user_id=actor_user_id,
                entity_type="project_settings",
                entity_id=project_id,
                source="api",
                properties=properties,
            ),
            conn=conn,
        )

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
        async with self.tx() as conn:
            record = await SettingRecord.get_or_none(
                scope_type=SCOPE_TYPE_PROJECT,
                scope_id=project_id,
                namespace=CORE_SETTINGS_NAMESPACE,
                using_db=conn,
            )
            current = record.value if record and isinstance(record.value, dict) else {}
            merged = merge_deep(current, patch)

            validate_config_schema(CORE_SETTINGS_SCHEMA, merged, allow_unknown=True)

            if record is None:
                saved = await SettingRecord.create(
                    using_db=conn,
                    scope_type=SCOPE_TYPE_PROJECT,
                    scope_id=project_id,
                    namespace=CORE_SETTINGS_NAMESPACE,
                    value=merged or None,
                    updated_by=updated_by,
                )
            else:
                record.value = merged or None
                cast(SettingUpdatedBy, record).updated_by = updated_by
                await record.save(update_fields=["value", "updated_by", "updated_at"], using_db=conn)
                saved = record

            if updated_by is not None:
                changed_paths = sorted(self._flatten_patch_paths(patch))
                await self._write_settings_activity_event(
                    project_id=project_id,
                    actor_user_id=updated_by,
                    changed_paths=changed_paths,
                    contains_sensitive_values=self._contains_secret_paths(changed_paths),
                    conn=conn,
                )

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

    @staticmethod
    def _flatten_patch_paths(patch: dict[str, Any]) -> set[str]:
        paths: set[str] = set()

        def visit(prefix: str, value: Any) -> None:
            if isinstance(value, dict) and value:
                for key, child in value.items():
                    next_prefix = f"{prefix}.{key}" if prefix else str(key)
                    visit(next_prefix, child)
                return
            if prefix:
                paths.add(prefix)

        visit("", patch)
        return paths

    @staticmethod
    def _contains_secret_paths(paths: list[str]) -> bool:
        secret_paths = set(iter_secret_field_paths(CORE_SETTINGS_SCHEMA))
        return any(path in secret_paths for path in paths)
