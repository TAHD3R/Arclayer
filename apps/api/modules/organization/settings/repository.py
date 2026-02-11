from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from apps.api.common.protocols.tortoise import SettingUpdatedBy
from apps.api.common.repositories import BaseRepository
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.organization.models.organization import Organization
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.modules.workspaces.models.workspace import WorkspaceMembership, WorkspaceMembershipStatus
from apps.api.settings.scopes import SCOPE_TYPE_ORG


class OrganizationSettingsRepository(BaseRepository):
    async def get_organization(self, *, organization_id: UUID) -> Organization | None:
        return await Organization.get_or_none(id=organization_id)

    async def get_membership(self, *, organization_id: UUID, user_id: UUID) -> OrgMembership | None:
        return await OrgMembership.get_or_none(organization_id=organization_id, user_id=user_id)

    async def get_core_setting(self, *, organization_id: UUID) -> SettingRecord | None:
        return await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_ORG,
            scope_id=organization_id,
            namespace="core",
        )

    async def save_core_setting(
        self,
        *,
        organization_id: UUID,
        value: dict[str, Any],
        updated_by: UUID | None,
    ) -> SettingRecord:
        record = await self.get_core_setting(organization_id=organization_id)
        if record is None:
            return await SettingRecord.create(
                scope_type=SCOPE_TYPE_ORG,
                scope_id=organization_id,
                namespace="core",
                value=value,
                updated_by=updated_by,
            )

        record.value = value
        cast(SettingUpdatedBy, record).updated_by = updated_by
        await record.save(update_fields=["value", "updated_by", "updated_at"])
        return record

    async def count_owner_memberships(self, *, organization_id: UUID) -> int:
        return int(await OrgMembership.filter(organization_id=organization_id, role=OrgRole.OWNER).count())

    async def disable_workspace_memberships(self, *, organization_id: UUID, user_id: UUID) -> None:
        await WorkspaceMembership.filter(
            user_id=user_id,
            workspace__organization_id=organization_id,
        ).update(status=WorkspaceMembershipStatus.DISABLED)

    async def update_member_role_code_for_active_members(
        self,
        *,
        organization_id: UUID,
        role: OrgRole,
        role_code: str,
    ) -> int:
        return int(
            await OrgMembership.filter(
                organization_id=organization_id,
                role=OrgRole.MEMBER,
                status="active",
            ).update(role=role, role_code=role_code)
        )

    async def clear_org_scoped_settings(self, *, organization_id: UUID) -> None:
        await SettingRecord.filter(scope_type=SCOPE_TYPE_ORG, scope_id=organization_id).delete()
