from __future__ import annotations

from uuid import UUID

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Forbidden, NotFound
from apps.api.src.core.i18n import t
from apps.api.src.modules.organization.models.org_membership import OrgRole
from apps.api.src.modules.organization.rbac.service import OrganizationRBACService
from apps.api.src.modules.organization.settings.repository import OrganizationSettingsRepository
from apps.api.src.modules.organization.settings.schema import (
    DeleteOrganizationResult,
    LeaveOrganizationResult,
    OrganizationAssignDefaultRoleResult,
    OrganizationLocalizationOut,
    OrganizationSettingsCoreOut,
    OrganizationSettingsCorePatch,
)

_DEFAULT_ORG_LOCALE = "zh-CN"
_DEFAULT_ORG_TIMEZONE = "Asia/Shanghai"
_DEFAULT_ORG_DATE_FORMAT = "YYYY-MM-DD"


class OrganizationSettingsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationSettingsRepository()
        self.rbac = OrganizationRBACService(settings)

    async def get_core_detail(self, *, organization_id: UUID) -> OrganizationSettingsCoreOut:
        org = await self.repo.get_organization(organization_id=organization_id)
        if org is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        record = await self.repo.get_core_setting(organization_id=organization_id)
        raw_value = record.value if record and isinstance(record.value, dict) else {}

        locale = self._read_str(raw_value, ["organization_localization", "locale"]) or _DEFAULT_ORG_LOCALE
        timezone = self._read_str(raw_value, ["organization_localization", "timezone"]) or _DEFAULT_ORG_TIMEZONE
        date_format = (
            self._read_str(raw_value, ["organization_localization", "date_format"]) or _DEFAULT_ORG_DATE_FORMAT
        )
        default_role_code = self._read_str(raw_value, ["default_role_code"]) or OrgRole.MEMBER.value

        return OrganizationSettingsCoreOut(
            organization_id=org.id,
            organization_name=org.name,
            organization_localization=OrganizationLocalizationOut(
                locale=locale,
                timezone=timezone,
                date_format=date_format,
            ),
            default_role_code=default_role_code,
        )

    async def patch_core(
        self,
        *,
        organization_id: UUID,
        patch: OrganizationSettingsCorePatch,
        updated_by: UUID,
    ) -> OrganizationSettingsCoreOut:
        org = await self.repo.get_organization(organization_id=organization_id)
        if org is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        current_record = await self.repo.get_core_setting(organization_id=organization_id)
        current_value: dict[str, object] = (
            current_record.value if current_record and isinstance(current_record.value, dict) else {}
        )
        next_value: dict[str, object] = dict(current_value)
        changed_setting = False

        if patch.organization_name is not None:
            normalized_name = str(patch.organization_name).strip()
            if not normalized_name:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_ORG_NAME")
            if len(normalized_name) > 128:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_ORG_NAME")
            if org.name != normalized_name:
                org.name = normalized_name
                await org.save(update_fields=["name", "updated_at"])

        if patch.organization_localization is not None:
            raw_localization = next_value.get("organization_localization")
            localization: dict[str, str] = {}
            if isinstance(raw_localization, dict):
                for key in ("locale", "timezone", "date_format"):
                    value = raw_localization.get(key)
                    if isinstance(value, str):
                        localization[key] = value
            if patch.organization_localization.locale is not None:
                localization["locale"] = str(patch.organization_localization.locale).strip()
            if patch.organization_localization.timezone is not None:
                localization["timezone"] = str(patch.organization_localization.timezone).strip()
            if patch.organization_localization.date_format is not None:
                localization["date_format"] = str(patch.organization_localization.date_format).strip()
            next_value["organization_localization"] = localization
            changed_setting = True

        if patch.default_role_code is not None:
            role_code = await self._normalize_role_code(
                organization_id=organization_id,
                role_code=patch.default_role_code,
            )
            next_value["default_role_code"] = role_code
            changed_setting = True

        if changed_setting:
            await self.repo.save_core_setting(
                organization_id=organization_id,
                value=next_value,
                updated_by=updated_by,
            )

        return await self.get_core_detail(organization_id=organization_id)

    async def assign_default_role_to_members(
        self,
        *,
        organization_id: UUID,
        role_code: str,
        confirm_name: str,
    ) -> OrganizationAssignDefaultRoleResult:
        org = await self.repo.get_organization(organization_id=organization_id)
        if org is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        normalized_confirm_name = str(confirm_name or "").strip()
        if normalized_confirm_name != str(org.name):
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="参数错误"),
                error="ORG_SETTINGS_CONFIRM_NAME_MISMATCH",
            )

        normalized_role_code = await self._normalize_role_code(
            organization_id=organization_id,
            role_code=role_code,
        )
        target_role = self._to_builtin_org_role(normalized_role_code)
        updated_count = await self.repo.update_member_role_code_for_active_members(
            organization_id=organization_id,
            role=target_role,
            role_code=normalized_role_code,
        )

        return OrganizationAssignDefaultRoleResult(
            organization_id=organization_id,
            role_code=normalized_role_code,
            updated_count=updated_count,
        )

    async def leave_organization(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        confirm_text: str,
    ) -> LeaveOrganizationResult:
        if str(confirm_text or "").strip() != "LEAVE":
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="参数错误"),
                error="ORG_LEAVE_CONFIRM_TEXT_MISMATCH",
            )

        membership = await self.repo.get_membership(organization_id=organization_id, user_id=user_id)
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        if membership.role == OrgRole.OWNER:
            owner_count = await self.repo.count_owner_memberships(organization_id=organization_id)
            if owner_count <= 1:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                    error="ORG_OWNER_AT_LEAST_ONE_REQUIRED",
                )

        membership_id = membership.id
        await self.repo.disable_workspace_memberships(organization_id=organization_id, user_id=user_id)
        await membership.delete()

        return LeaveOrganizationResult(
            organization_id=organization_id,
            membership_id=membership_id,
            left=True,
        )

    async def delete_organization(
        self,
        *,
        organization_id: UUID,
        confirm_name: str,
    ) -> DeleteOrganizationResult:
        org = await self.repo.get_organization(organization_id=organization_id)
        if org is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        normalized_confirm_name = str(confirm_name or "").strip()
        if normalized_confirm_name != str(org.name):
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="参数错误"),
                error="ORG_DELETE_CONFIRM_NAME_MISMATCH",
            )

        await self.repo.clear_org_scoped_settings(organization_id=organization_id)
        await org.delete()
        return DeleteOrganizationResult(organization_id=organization_id, deleted=True)

    async def _normalize_role_code(self, *, organization_id: UUID, role_code: str) -> str:
        code = str(role_code or "").strip().lower()
        if not code:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="ROLE_CODE_NOT_FOUND")

        await self.rbac.ensure_defaults(organization_id=organization_id)
        role = await self.rbac.repo.get_role_by_code(organization_id=organization_id, code=code)
        if role is None:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="ROLE_CODE_NOT_FOUND")
        return str(role.code)

    @staticmethod
    def _read_str(value: dict[str, object], path: list[str]) -> str | None:
        current: object = value
        for part in path:
            if not isinstance(current, dict):
                return None
            current = current.get(part)
        if not isinstance(current, str):
            return None
        normalized = current.strip()
        return normalized or None

    @staticmethod
    def _to_builtin_org_role(role_code: str) -> OrgRole:
        code = str(role_code or "").strip().lower()
        if code == OrgRole.OWNER.value:
            return OrgRole.OWNER
        if code == OrgRole.ADMIN.value:
            return OrgRole.ADMIN
        return OrgRole.MEMBER
