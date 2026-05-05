from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.protocols.tortoise import SettingUpdatedBy
from src.common.types.json_types import JsonObject
from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.system.rbac import Role
from src.models.system.setting import SettingRecord
from src.models.workspaces.workspace import (
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.onboarding.service import (
    WorkspaceFirstOnboardingService,
    WorkspaceFirstOnboardingStatus,
)
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.system.rbac.constants.service import ROLE_ADMIN, ROLE_OWNER
from src.modules.workspaces.settings.integrations.webhooks.service import WebhooksService
from src.modules.workspaces.settings.schema import (
    WorkspaceAssignRoleToMembersResult,
    WorkspaceRolePolicyOut,
    WorkspaceSettingsDetail,
)
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from src.settings.scopes import SCOPE_TYPE_WORKSPACE
from src.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema

WORKSPACE_CORE_SETTINGS_UPDATED_EVENT = "settings.workspace.core.updated"
WORKSPACE_ROLE_POLICY_CHANGED_EVENT = "permission.assignment.changed"


class WorkspaceSettingsService(BaseService):
    """
    Workspace-scoped settings service (v2).

    Currently only supports the core settings namespace.
    """

    def __init__(
        self,
        settings,
        *,
        workspace_repo: OrganizationWorkspaceRepository | None = None,
        webhooks_service: WebhooksService | None = None,
        onboarding_service: WorkspaceFirstOnboardingService | None = None,
    ) -> None:
        super().__init__(settings)
        self.workspace_repo = workspace_repo or OrganizationWorkspaceRepository()
        self.webhooks_service = webhooks_service or WebhooksService(settings)
        self.onboarding_service = onboarding_service or WorkspaceFirstOnboardingService(settings)

    async def _write_role_policy_activity_event(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        payload: JsonObject = {
            "workspace_id": str(workspace_id),
            "actor_user_id": str(actor_user_id),
        }
        payload.update(properties)
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=WORKSPACE_ROLE_POLICY_CHANGED_EVENT,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="workspace_role_policy",
                entity_id=workspace_id,
                source="api",
                properties=payload,
            ),
            conn=conn,
        )

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
        self,
        *,
        workspace_id: UUID,
        patch: dict[str, Any],
        updated_by: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceSettingsDetail:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_id,
            namespace=CORE_SETTINGS_NAMESPACE,
            using_db=conn,
        )
        current = record.value if record and isinstance(record.value, dict) else {}
        merged = merge_deep(current, patch)

        validate_config_schema(CORE_SETTINGS_SCHEMA, merged, allow_unknown=True)

        if record is None:
            saved = await SettingRecord.create(
                using_db=conn,
                scope_type=SCOPE_TYPE_WORKSPACE,
                scope_id=workspace_id,
                namespace=CORE_SETTINGS_NAMESPACE,
                value=merged or None,
                updated_by=updated_by,
            )
        else:
            record.value = merged or None
            cast(SettingUpdatedBy, record).updated_by = updated_by
            await record.save(update_fields=["value", "updated_by", "updated_at"], using_db=conn)
            saved = record

        masked, secrets = self._mask_secrets(merged)
        try:
            self.webhooks_service.emit_workspace_event_fire_and_forget(
                workspace_id=workspace_id,
                event=WORKSPACE_CORE_SETTINGS_UPDATED_EVENT,
                payload={
                    "workspace_id": str(workspace_id),
                    "namespace": CORE_SETTINGS_NAMESPACE,
                    "paths": list(self._flatten_patch_paths(patch)),
                },
            )
        except BaseException as exc:
            # Best-effort: webhook emission must not break core settings updates.
            self.logger.warning(
                "Webhook emission failed for workspace settings update",
                action="emit_workspace_settings_webhook",
                workspace_id=str(workspace_id),
                error=str(exc),
            )

        if updated_by is not None and isinstance(patch.get("workspace_localization"), dict):
            onboarding_state = await self.onboarding_service.get_state(user_id=updated_by)
            if (
                onboarding_state.status == WorkspaceFirstOnboardingStatus.PENDING_WORKSPACE_DEFAULTS
                and onboarding_state.workspace_id == workspace_id
            ):
                await self.onboarding_service.mark_completed(user_id=updated_by, workspace_id=workspace_id)

        return WorkspaceSettingsDetail(
            namespace=CORE_SETTINGS_NAMESPACE,
            value=masked,
            secrets=secrets,
            updated_at=saved.updated_at,
        )

    async def get_role_policy(self, *, workspace_id: UUID) -> WorkspaceRolePolicyOut:
        workspace = await self.workspace_repo.get_active_workspace_by_id(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        roles = await Role.filter(workspace_id=workspace_id).order_by("code").all()
        if not roles:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ROLE_CODE_NOT_FOUND")

        default_role = next((item for item in roles if bool(item.is_default)), roles[0])
        return WorkspaceRolePolicyOut(
            workspace_id=workspace_id,
            default_role_code=str(default_role.code),
        )

    async def patch_role_policy(
        self,
        *,
        workspace_id: UUID,
        default_role_code: str,
        actor_user_id: UUID,
    ) -> WorkspaceRolePolicyOut:
        workspace = await self.workspace_repo.get_active_workspace_by_id(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        code = str(default_role_code or "").strip().lower()
        if not code:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ROLE_CODE_NOT_FOUND")

        target_role = await Role.get_or_none(workspace_id=workspace_id, code=code)
        if target_role is None:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ROLE_CODE_NOT_FOUND")

        current_default_role = await Role.filter(workspace_id=workspace_id, is_default=True).order_by("code").first()
        previous_default_role_code = str(current_default_role.code) if current_default_role is not None else None

        async with self.tx() as conn:
            await (
                Role
                .filter(workspace_id=workspace_id, is_default=True)
                .using_db(conn)
                .exclude(id=target_role.id)
                .update(is_default=False)
            )
            if not bool(target_role.is_default):
                target_role.is_default = True
                await target_role.save(update_fields=["is_default", "updated_at"], using_db=conn)
            await self._write_role_policy_activity_event(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                properties={
                    "change": "default_role",
                    "previous_default_role_code": previous_default_role_code,
                    "default_role_code": code,
                },
                conn=conn,
            )

        return await self.get_role_policy(workspace_id=workspace_id)

    async def assign_role_to_regular_members(
        self,
        *,
        workspace_id: UUID,
        role_code: str,
        confirm_name: str,
        actor_user_id: UUID,
    ) -> WorkspaceAssignRoleToMembersResult:
        workspace = await self.workspace_repo.get_active_workspace_by_id(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        if str(confirm_name or "").strip() != str(workspace.name):
            raise BadRequest(
                message=t("errors", "BAD_REQUEST"),
                error="WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH",
            )

        code = str(role_code or "").strip().lower()
        if not code:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ROLE_CODE_NOT_FOUND")

        target_role = await Role.get_or_none(workspace_id=workspace_id, code=code)
        if target_role is None:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ROLE_CODE_NOT_FOUND")

        excluded_membership_ids = {
            UUID(str(member_id))
            for member_id in await WorkspaceMembershipRole.filter(
                membership__workspace_id=workspace_id,
                membership__status=WorkspaceMembershipStatus.ACTIVE,
                role__code__in=[ROLE_OWNER, ROLE_ADMIN],
            ).values_list("membership_id", flat=True)
            if member_id is not None
        }

        target_memberships_query = WorkspaceMembership.filter(
            workspace_id=workspace_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        if excluded_membership_ids:
            target_memberships_query = target_memberships_query.exclude(id__in=list(excluded_membership_ids))

        target_memberships = await target_memberships_query.all()
        if not target_memberships:
            return WorkspaceAssignRoleToMembersResult(
                workspace_id=workspace_id,
                role_code=code,
                updated_count=0,
            )

        async with self.tx() as conn:
            for membership in target_memberships:
                await WorkspaceMembershipRole.filter(membership_id=membership.id).using_db(conn).delete()
                await WorkspaceMembershipRole.get_or_create(
                    using_db=conn,
                    membership_id=membership.id,
                    role_id=target_role.id,
                )
            await self._write_role_policy_activity_event(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                properties={
                    "change": "regular_member_role_assignment",
                    "role_code": code,
                    "updated_count": len(target_memberships),
                },
                conn=conn,
            )

        return WorkspaceAssignRoleToMembersResult(
            workspace_id=workspace_id,
            role_code=code,
            updated_count=len(target_memberships),
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
                out.extend(WorkspaceSettingsService._flatten_patch_paths(value, _prefix=path))
            else:
                out.append(path)
        return out
