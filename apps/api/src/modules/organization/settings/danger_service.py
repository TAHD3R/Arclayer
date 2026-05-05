from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.exceptions import Forbidden, NotFound
from src.core.services import BaseService
from src.models.organization.org_membership import OrgRole
from src.modules.organization.rbac.service import OrganizationRBACService
from src.modules.organization.settings.leave_guard import OrganizationLeaveGuard
from src.modules.organization.settings.repository import OrganizationSettingsRepository
from src.modules.organization.settings.schema import (
    OrganizationDangerActionOut,
    OrganizationDangerCapabilitiesOut,
)


class OrganizationDangerService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationSettingsRepository()
        self.rbac = OrganizationRBACService(settings)

    async def get_capabilities(self, *, organization_id: UUID, user_id: UUID) -> OrganizationDangerCapabilitiesOut:
        org = await self.repo.get_organization(organization_id=organization_id)
        if org is None:
            raise NotFound(error="NOT_FOUND")
        membership = await self.repo.get_membership(organization_id=organization_id, user_id=user_id)
        if membership is None:
            raise NotFound(error="NOT_FOUND")
        role_code = self.rbac.resolve_membership_role_code(membership)
        leave_blocked_reason = await self._get_leave_blocked_reason(
            organization_id=organization_id,
            user_id=user_id,
            role=membership.role,
        )
        delete_blocked_reason = await self._get_delete_blocked_reason(
            organization_id=organization_id,
            role_code=role_code,
        )
        return OrganizationDangerCapabilitiesOut(
            organization_id=organization_id,
            role_code=role_code,
            confirm_delete_name=str(org.name),
            leave_action=OrganizationDangerActionOut(
                enabled=leave_blocked_reason is None,
                blocked_reason=leave_blocked_reason,
            ),
            delete_action=OrganizationDangerActionOut(
                enabled=delete_blocked_reason is None,
                blocked_reason=delete_blocked_reason,
            ),
        )

    async def _get_leave_blocked_reason(self, *, organization_id: UUID, user_id: UUID, role: OrgRole) -> str | None:
        if role == OrgRole.OWNER:
            owner_count = await self.repo.count_owner_memberships(organization_id=organization_id)
            if owner_count <= 1:
                return "ORG_OWNER_AT_LEAST_ONE_REQUIRED"
        try:
            await OrganizationLeaveGuard().ensure_can_leave(organization_id=organization_id, user_id=user_id)
        except Forbidden as exc:
            return str(exc.error or "ORG_LEAVE_BLOCKED")
        return None

    async def _get_delete_blocked_reason(self, *, organization_id: UUID, role_code: str) -> str | None:
        allowed = await self.rbac.has_permission(
            organization_id=organization_id,
            role_code=role_code,
            permission_code="org.settings.delete",
        )
        if allowed:
            return None
        return "ORG_SETTINGS_DELETE_REQUIRED"
