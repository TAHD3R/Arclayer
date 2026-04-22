from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from src.common.protocols.tortoise import SettingUpdatedBy
from src.common.services import BaseService
from src.models.system.setting import SettingRecord
from src.modules.auth.onboarding.service import (
    WorkspaceFirstOnboardingService,
    WorkspaceFirstOnboardingStatus,
)
from src.modules.projects.settings.events import (
    PROJECT_CORE_SETTINGS_UPDATED_EVENT,
    build_project_settings_event_payload,
)
from src.modules.projects.settings.schema import ProjectSettingsDetail
from src.modules.workspaces.settings.integrations.webhooks.service import WebhooksService
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from src.settings.scopes import SCOPE_TYPE_WORKSPACE
from src.settings.validation import (
    iter_secret_field_paths,
    merge_deep,
    validate_config_schema,
)


class ProjectSettingsService(BaseService):
    async def get_core_detail(self, *, project_id: UUID, workspace_id: UUID) -> ProjectSettingsDetail:
        _ = project_id
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
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
        workspace_id: UUID,
        patch: dict[str, Any],
        updated_by: UUID | None,
    ) -> ProjectSettingsDetail:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        current = record.value if record and isinstance(record.value, dict) else {}
        merged = merge_deep(current, patch)

        validate_config_schema(CORE_SETTINGS_SCHEMA, merged, allow_unknown=True)

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
        try:
            WebhooksService(self.settings).emit_workspace_event_fire_and_forget(
                workspace_id=workspace_id,
                event=PROJECT_CORE_SETTINGS_UPDATED_EVENT,
                payload=build_project_settings_event_payload(
                    project_id=str(project_id),
                    workspace_id=str(workspace_id),
                    paths=list(self._flatten_patch_paths(patch)),
                ),
            )
        except BaseException as exc:
            self.logger.warning(
                "Webhook emission failed for project settings update",
                action="emit_project_settings_webhook",
                project_id=str(project_id),
                workspace_id=str(workspace_id),
                error=str(exc),
            )

        if updated_by is not None and isinstance(patch.get("workspace_localization"), dict):
            onboarding_service = WorkspaceFirstOnboardingService(self.settings)
            onboarding_state = await onboarding_service.get_state(user_id=updated_by)
            if (
                onboarding_state.status == WorkspaceFirstOnboardingStatus.PENDING_WORKSPACE_DEFAULTS
                and onboarding_state.workspace_id == workspace_id
            ):
                await onboarding_service.mark_completed(user_id=updated_by, workspace_id=workspace_id)

        return ProjectSettingsDetail(
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

    @staticmethod
    def _flatten_patch_paths(patch: dict[str, Any], *, _prefix: str = "") -> list[str]:
        out: list[str] = []
        for key, value in (patch or {}).items():
            if not key:
                continue
            path = f"{_prefix}.{key}" if _prefix else str(key)
            if isinstance(value, dict):
                out.extend(ProjectSettingsService._flatten_patch_paths(value, _prefix=path))
            else:
                out.append(path)
        return out
