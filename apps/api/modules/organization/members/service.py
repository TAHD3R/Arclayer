from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.common.protocols.tortoise import HasUserId
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.core.i18n import t
from apps.api.modules.organization.members.repository import OrganizationMemberRepository
from apps.api.modules.organization.members.schema import (
    OrganizationMemberDeleteResult,
    OrganizationMemberInviteRequest,
    OrganizationMemberInviteResult,
    OrganizationMemberOut,
)
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.workspaces.team.schema import WorkspaceEmailInviteCreateRequest
from apps.api.modules.workspaces.team.service import WorkspaceTeamService


class OrganizationMemberService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationMemberRepository()

    async def list_members(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        q: str | None,
    ) -> PageData[OrganizationMemberOut]:
        rows = await self.repo.list_memberships(organization_id=organization_id)

        needle = str(q or "").strip().lower()
        if needle:
            rows = [
                row
                for row in rows
                if needle in str(row.user.username or "").lower()
                or needle in str(row.user.email or "").lower()
                or needle in str(row.user.display_name or "").lower()
            ]

        items = [
            OrganizationMemberOut(
                id=row.id,
                membership_id=row.id,
                organization_id=organization_id,
                role=row.role,
                status=row.status,
                user_id=row.user.id,
                username=row.user.username,
                display_name=row.user.display_name,
                email=row.user.email,
                avatar_url=row.user.avatar_url,
                last_login_at=row.user.last_login_at,
                joined_at=row.created_at,
            )
            for row in rows
        ]
        return paginate_items(items, params=params)

    async def invite_member(
        self,
        *,
        organization_id: UUID,
        actor_user_id: UUID,
        actor_role: OrgRole,
        payload: OrganizationMemberInviteRequest,
    ) -> OrganizationMemberInviteResult:
        self._ensure_org_admin(actor_role=actor_role)

        email = str(payload.email or "").strip().lower()
        if not email or "@" not in email:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_EMAIL")

        existing = await self.repo.find_user_membership_by_email(organization_id=organization_id, email=email)
        if existing is not None:
            raise Conflict(
                message=t("errors", "CONFLICT", default="资源冲突"),
                error="ORG_MEMBER_ALREADY_EXISTS",
            )

        workspace = await self.repo.first_active_workspace(organization_id=organization_id)
        if workspace is None:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="参数错误"),
                error="ORG_WORKSPACE_REQUIRED",
            )

        if await self.repo.has_pending_invite(
            organization_id=organization_id,
            workspace_id=UUID(str(workspace.id)),
            email=email,
        ):
            raise Conflict(
                message=t("errors", "CONFLICT", default="资源冲突"),
                error="ORG_MEMBER_INVITE_ALREADY_PENDING",
            )

        # Reuse the workspace invitation flow so accept-invite remains the single onboarding path.
        team_service = WorkspaceTeamService(self.settings)
        created = await team_service.create_or_update_email_invite(
            organization_id=organization_id,
            workspace_id=UUID(str(workspace.id)),
            invited_by_user_id=actor_user_id,
            payload=WorkspaceEmailInviteCreateRequest(
                email=email,
                role_code=None,
                expires_in_seconds=payload.expires_in_seconds,
            ),
        )

        self.logger.info(
            "Organization member invited",
            action="organization_member_invite",
            organization_id=str(organization_id),
            actor_user_id=str(actor_user_id),
            workspace_id=str(workspace.id),
            email=email,
            requested_role=str(payload.role),
        )

        return OrganizationMemberInviteResult(
            invitation_id=created.invitation.id,
            email=created.invitation.email,
            role=payload.role,
            workspace_id=workspace.id,
            token=created.token,
            invite_url=created.invite_url,
        )

    async def update_member_role(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        target_membership_id: UUID,
        role: OrgRole,
    ) -> OrganizationMemberOut:
        actor_role = actor_membership.role
        self._ensure_org_admin(actor_role=actor_role)

        target = await self.repo.get_membership(organization_id=organization_id, membership_id=target_membership_id)
        if target is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        if actor_role == OrgRole.ADMIN:
            if target.role == OrgRole.OWNER or role == OrgRole.OWNER:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                    error="ORG_OWNER_REQUIRED",
                )

        if target.role == OrgRole.OWNER and role != OrgRole.OWNER:
            owner_count = await self.repo.count_role_memberships(organization_id=organization_id, role=OrgRole.OWNER)
            if owner_count <= 1:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="参数错误"),
                    error="ORG_OWNER_AT_LEAST_ONE_REQUIRED",
                )

        target.role = role
        await target.save(update_fields=["role", "updated_at"])

        self.logger.info(
            "Organization member role updated",
            action="organization_member_role_update",
            organization_id=str(organization_id),
            actor_user_id=str(cast(HasUserId, actor_membership).user_id),
            target_user_id=str(target.user.id),
            role=str(role),
        )

        return OrganizationMemberOut(
            id=target.id,
            membership_id=target.id,
            organization_id=organization_id,
            role=target.role,
            status=target.status,
            user_id=target.user.id,
            username=target.user.username,
            display_name=target.user.display_name,
            email=target.user.email,
            avatar_url=target.user.avatar_url,
            last_login_at=target.user.last_login_at,
            joined_at=target.created_at,
        )

    async def remove_member(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        target_membership_id: UUID,
    ) -> OrganizationMemberDeleteResult:
        actor_role = actor_membership.role
        self._ensure_org_admin(actor_role=actor_role)

        target = await self.repo.get_membership(organization_id=organization_id, membership_id=target_membership_id)
        if target is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        if actor_role == OrgRole.ADMIN and target.role == OrgRole.OWNER:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                error="ORG_OWNER_REQUIRED",
            )

        if target.role == OrgRole.OWNER:
            owner_count = await self.repo.count_role_memberships(organization_id=organization_id, role=OrgRole.OWNER)
            if owner_count <= 1:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="参数错误"),
                    error="ORG_OWNER_AT_LEAST_ONE_REQUIRED",
                )

        target_user_id = UUID(str(target.user.id))
        target_membership = UUID(str(target.id))
        await self.repo.disable_workspace_memberships(organization_id=organization_id, user_id=target_user_id)
        await target.delete()

        self.logger.info(
            "Organization member removed",
            action="organization_member_remove",
            organization_id=str(organization_id),
            actor_user_id=str(cast(HasUserId, actor_membership).user_id),
            target_user_id=str(target_user_id),
        )

        return OrganizationMemberDeleteResult(membership_id=target_membership, removed=True)

    def _ensure_org_admin(self, *, actor_role: OrgRole) -> None:
        if actor_role in (OrgRole.OWNER, OrgRole.ADMIN):
            return
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_ADMIN_REQUIRED",
        )
