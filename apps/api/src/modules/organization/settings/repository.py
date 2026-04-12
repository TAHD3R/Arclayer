from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from src.common.protocols.tortoise import SettingUpdatedBy
from src.common.repositories import BaseRepository
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization
from src.models.system.setting import SettingRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.settings.scopes import SCOPE_TYPE_ORG


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
        return int(
            await OrgMembership.filter(organization_id=organization_id, role=OrgRole.OWNER, status="active").count()
        )

    async def disable_workspace_memberships(self, *, organization_id: UUID, user_id: UUID) -> None:
        # Tortoise 在 UPDATE + 关联字段过滤（workspace__organization_id）下会生成
        # Postgres 不合法 SQL（FROM clause reference），因此改为两段式：
        # 1) 先取 workspace_id 列表
        # 2) 再按 workspace_id__in 做批量 update
        ws_ids = await Workspace.filter(organization_id=organization_id).values_list("id", flat=True)
        if not ws_ids:
            return
        await WorkspaceMembership.filter(user_id=user_id, workspace_id__in=list(ws_ids)).update(
            status=WorkspaceMembershipStatus.DISABLED
        )

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
