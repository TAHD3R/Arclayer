from __future__ import annotations

from uuid import UUID

from src.common.constants.assets import ASSET_SCOPE_ORGANIZATION
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, Forbidden, NotFound
from src.core.i18n import t
from src.models.assets.asset import AssetPurpose
from src.models.organization.org_membership import OrgRole
from src.modules.assets.admin.assets.binding_align import align_asset_for_binding
from src.modules.assets.public_url import try_extract_asset_uuid_from_relative_public_url
from src.modules.assets.scope import AssetScope
from src.modules.organization.rbac.service import OrganizationRBACService
from src.modules.organization.settings.leave_guard import OrganizationLeaveGuard
from src.modules.organization.settings.repository import OrganizationSettingsRepository
from src.modules.organization.settings.schema import (
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
_DEFAULT_ORG_USE_BROWSER_TIMEZONE = True
_DEFAULT_ORG_USE_RELATIVE_DATETIME = True


class OrganizationSettingsService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationSettingsRepository()
        self.rbac = OrganizationRBACService(settings)

    async def get_core_detail(self, *, organization_id: UUID) -> OrganizationSettingsCoreOut:
        org = await self.repo.get_organization(organization_id=organization_id)
        if org is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        record = await self.repo.get_core_setting(organization_id=organization_id)
        raw_value = record.value if record and isinstance(record.value, dict) else {}

        locale = self._read_str(raw_value, ["organization_localization", "locale"]) or _DEFAULT_ORG_LOCALE
        timezone = self._read_str(raw_value, ["organization_localization", "timezone"]) or _DEFAULT_ORG_TIMEZONE
        date_format = (
            self._read_str(raw_value, ["organization_localization", "date_format"]) or _DEFAULT_ORG_DATE_FORMAT
        )
        use_browser_timezone = self._read_bool(raw_value, ["organization_localization", "use_browser_timezone"])
        if use_browser_timezone is None:
            use_browser_timezone = _DEFAULT_ORG_USE_BROWSER_TIMEZONE
        use_relative_datetime = self._read_bool(raw_value, ["organization_localization", "use_relative_datetime"])
        if use_relative_datetime is None:
            use_relative_datetime = _DEFAULT_ORG_USE_RELATIVE_DATETIME
        default_role_code = self._read_str(raw_value, ["default_role_code"]) or OrgRole.MEMBER.value

        return OrganizationSettingsCoreOut(
            organization_id=org.id,
            organization_name=org.name,
            organization_logo_url=org.logo_url,
            organization_logo_asset_aligned=False,
            organization_localization=OrganizationLocalizationOut(
                locale=locale,
                timezone=timezone,
                date_format=date_format,
                use_browser_timezone=use_browser_timezone,
                use_relative_datetime=use_relative_datetime,
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
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        current_record = await self.repo.get_core_setting(organization_id=organization_id)
        current_value: dict[str, object] = (
            current_record.value if current_record and isinstance(current_record.value, dict) else {}
        )
        next_value: dict[str, object] = dict(current_value)
        changed_setting = False
        logo_asset_aligned = False

        if patch.organization_name is not None:
            normalized_name = str(patch.organization_name).strip()
            if not normalized_name:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_ORG_NAME")
            if len(normalized_name) > 128:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_ORG_NAME")
            if org.name != normalized_name:
                org.name = normalized_name
                await org.save(update_fields=["name", "updated_at"])

        if patch.organization_logo_url is not None:
            raw = str(patch.organization_logo_url).strip()
            logo_url = raw or None
            if logo_url is not None and len(logo_url) > 512:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ORG_LOGO_URL_TOO_LONG")
            if logo_url is not None:
                asset_uuid = try_extract_asset_uuid_from_relative_public_url(logo_url)
                if asset_uuid is not None:
                    logo_asset_aligned = await align_asset_for_binding(
                        self.settings,
                        scope=AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=organization_id),
                        asset_id=asset_uuid,
                        purpose=AssetPurpose.SITE_LOGO,
                    )
            if org.logo_url != logo_url:
                org.logo_url = logo_url
                await org.save(update_fields=["logo_url", "updated_at"])

        if patch.organization_localization is not None:
            raw_localization = next_value.get("organization_localization")
            localization: dict[str, object] = {}
            if isinstance(raw_localization, dict):
                for key in ("locale", "timezone", "date_format", "use_browser_timezone", "use_relative_datetime"):
                    value = raw_localization.get(key)
                    if isinstance(value, str):
                        localization[key] = value
                    if isinstance(value, bool):
                        localization[key] = value
            if patch.organization_localization.locale is not None:
                localization["locale"] = str(patch.organization_localization.locale).strip()
            if patch.organization_localization.timezone is not None:
                localization["timezone"] = str(patch.organization_localization.timezone).strip()
            if patch.organization_localization.date_format is not None:
                localization["date_format"] = str(patch.organization_localization.date_format).strip()
            if patch.organization_localization.use_browser_timezone is not None:
                localization["use_browser_timezone"] = bool(patch.organization_localization.use_browser_timezone)
            if patch.organization_localization.use_relative_datetime is not None:
                localization["use_relative_datetime"] = bool(patch.organization_localization.use_relative_datetime)
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

        out = await self.get_core_detail(organization_id=organization_id)
        return out.model_copy(update={"organization_logo_asset_aligned": logo_asset_aligned})

    async def assign_default_role_to_members(
        self,
        *,
        organization_id: UUID,
        role_code: str,
        confirm_name: str,
    ) -> OrganizationAssignDefaultRoleResult:
        org = await self.repo.get_organization(organization_id=organization_id)
        if org is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        normalized_confirm_name = str(confirm_name or "").strip()
        if normalized_confirm_name != str(org.name):
            raise BadRequest(
                message=t("errors", "BAD_REQUEST"),
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
                message=t("errors", "BAD_REQUEST"),
                error="ORG_LEAVE_CONFIRM_TEXT_MISMATCH",
            )

        membership = await self.repo.get_membership(organization_id=organization_id, user_id=user_id)
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        if membership.role == OrgRole.OWNER:
            owner_count = await self.repo.count_owner_memberships(organization_id=organization_id)
            if owner_count <= 1:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED"),
                    error="ORG_OWNER_AT_LEAST_ONE_REQUIRED",
                )

        await OrganizationLeaveGuard().ensure_can_leave(organization_id=organization_id, user_id=user_id)

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
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        normalized_confirm_name = str(confirm_name or "").strip()
        if normalized_confirm_name != str(org.name):
            raise BadRequest(
                message=t("errors", "BAD_REQUEST"),
                error="ORG_DELETE_CONFIRM_NAME_MISMATCH",
            )

        await self.repo.clear_org_scoped_settings(organization_id=organization_id)
        await org.delete()
        return DeleteOrganizationResult(organization_id=organization_id, deleted=True)

    async def _normalize_role_code(self, *, organization_id: UUID, role_code: str) -> str:
        code = str(role_code or "").strip().lower()
        if not code:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ROLE_CODE_NOT_FOUND")

        await self.rbac.ensure_defaults(organization_id=organization_id)
        role = await self.rbac.repo.get_role_by_code(organization_id=organization_id, code=code)
        if role is None:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="ROLE_CODE_NOT_FOUND")
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
    def _read_bool(value: dict[str, object], path: list[str]) -> bool | None:
        current: object = value
        for part in path:
            if not isinstance(current, dict):
                return None
            current = current.get(part)
        if not isinstance(current, bool):
            return None
        return current

    @staticmethod
    def _to_builtin_org_role(role_code: str) -> OrgRole:
        code = str(role_code or "").strip().lower()
        if code == OrgRole.OWNER.value:
            return OrgRole.OWNER
        if code == OrgRole.ADMIN.value:
            return OrgRole.ADMIN
        return OrgRole.MEMBER
