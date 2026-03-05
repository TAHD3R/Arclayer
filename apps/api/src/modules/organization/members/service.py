from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any, Protocol, cast
from uuid import UUID

from apps.api.src.common.email.service import EmailService
from apps.api.src.common.invitations.expiry.service import build_expires_at
from apps.api.src.common.invitations.tokens.service import build_invite_token, generate_invite_code
from apps.api.src.common.protocols.tortoise import HasUserId
from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.core.i18n import t
from apps.api.src.models.organization.org_invitation import (
    OrganizationEmailInvite,
    OrganizationInviteLink,
)
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.user import User
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.models.workspaces.workspace import WorkspaceMembership
from apps.api.src.modules.organization.members.repository import OrganizationMemberRepository
from apps.api.src.modules.organization.members.schema import (
    OrganizationInvitationOut,
    OrganizationInvitationRenewResult,
    OrganizationInvitationUserRefOut,
    OrganizationInviteLinkCreateRequest,
    OrganizationInviteLinkCreateResult,
    OrganizationInviteLinkOut,
    OrganizationInviteLinkParticipantOut,
    OrganizationInviteLinkRenewResult,
    OrganizationMemberDeleteResult,
    OrganizationMemberInviteRequest,
    OrganizationMemberInviteResult,
    OrganizationMemberOut,
    OrganizationMemberWorkspaceOut,
)
from apps.api.src.modules.organization.rbac.service import OrganizationRBACService
from apps.api.src.settings.scopes import SCOPE_TYPE_ORG


class _RoleCodeRef(Protocol):
    code: str


class _MembershipRoleRef(Protocol):
    role: _RoleCodeRef


class _WorkspaceRef(Protocol):
    id: UUID | str
    name: str
    slug: str


class _WorkspaceMembershipWithRelations(Protocol):
    workspace: _WorkspaceRef | None
    membership_roles: list[_MembershipRoleRef] | None


class _HasNullableExpiresAt(Protocol):
    expires_at: datetime | None


_ORG_MEMBER_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset({
    "joined_at",
    "username",
    "email",
    "display_name",
    "role_code",
    "status",
    "user_status",
    "workspace_count",
    "last_login_at",
})


def _normalize_member_ordering(value: str | None) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _ORG_MEMBER_ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["joined_at"]


class OrganizationMemberService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationMemberRepository()
        self.rbac = OrganizationRBACService(settings)
        self.email_service = EmailService(settings)

    async def list_members(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        role: OrgRole | None,
        role_code: str | None,
        membership_status: str | None,
        user_status: str | None,
        has_workspace: bool | None,
        joined_from: datetime | None,
        joined_to: datetime | None,
        last_login_from: datetime | None,
        last_login_to: datetime | None,
    ) -> PageData[OrganizationMemberOut]:
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.members.read",
        )

        rows = await self.repo.list_memberships(organization_id=organization_id)
        user_ids = [UUID(str(row.user.id)) for row in rows]
        workspace_rows = await self.repo.list_workspace_memberships_for_user_ids(
            organization_id=organization_id,
            user_ids=user_ids,
        )
        workspace_map = self._build_workspace_map(workspace_rows)

        needle = str(q or "").strip().lower()
        normalized_role_code = str(role_code or "").strip().lower() or None
        normalized_membership_status = str(membership_status or "").strip().lower() or None
        normalized_user_status = str(user_status or "").strip().lower() or None

        items: list[OrganizationMemberOut] = []
        for row in rows:
            if role is not None and row.role != role:
                continue

            effective_role_code = str(getattr(row, "role_code", row.role.value) or "").strip().lower()
            if normalized_role_code and effective_role_code != normalized_role_code:
                continue

            if normalized_membership_status and str(row.status).lower() != normalized_membership_status:
                continue

            member_user_status = str(row.user.status).lower()
            if normalized_user_status and member_user_status != normalized_user_status:
                continue

            member_joined_at = row.created_at
            if joined_from and member_joined_at < joined_from:
                continue
            if joined_to and member_joined_at > joined_to:
                continue

            last_login_at = row.user.last_login_at
            if last_login_from and (last_login_at is None or last_login_at < last_login_from):
                continue
            if last_login_to and (last_login_at is None or last_login_at > last_login_to):
                continue

            if needle:
                if (
                    needle not in str(row.user.username or "").lower()
                    and needle not in str(row.user.email or "").lower()
                    and needle not in str(row.user.display_name or "").lower()
                ):
                    continue

            workspace_items = workspace_map.get(UUID(str(row.user.id)), [])
            workspace_count = len(workspace_items)

            if has_workspace is True and workspace_count <= 0:
                continue
            if has_workspace is False and workspace_count > 0:
                continue

            items.append(
                OrganizationMemberOut(
                    id=row.id,
                    membership_id=row.id,
                    organization_id=organization_id,
                    role=row.role,
                    role_code=effective_role_code or str(row.role.value),
                    status=row.status,
                    user_id=row.user.id,
                    username=row.user.username,
                    display_name=row.user.display_name,
                    email=row.user.email,
                    avatar_url=row.user.avatar_url,
                    user_status=row.user.status,
                    last_login_at=row.user.last_login_at,
                    joined_at=row.created_at,
                    workspace_count=workspace_count,
                    workspaces=workspace_items,
                )
            )

        sorted_items = self._sort_members(items=items, ordering=ordering)
        return paginate_items(sorted_items, params=params)

    async def invite_member(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        payload: OrganizationMemberInviteRequest,
    ) -> OrganizationMemberInviteResult:
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.create",
            error_code="ORG_INVITATIONS_CREATE_REQUIRED",
        )

        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))

        email = str(payload.email or "").strip().lower()
        if not email or "@" not in email:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="Invalid request"), error="INVALID_EMAIL")

        existing = await self.repo.find_user_membership_by_email(organization_id=organization_id, email=email)
        if existing is not None:
            raise Conflict(
                message=t("errors", "CONFLICT", default="Resource conflict"),
                error="ORG_MEMBER_ALREADY_EXISTS",
            )

        if await self.repo.has_pending_email_invite(organization_id=organization_id, email=email):
            raise Conflict(
                message=t("errors", "CONFLICT", default="Resource conflict"),
                error="ORG_MEMBER_INVITE_ALREADY_PENDING",
            )

        requested_role_code = payload.role_code
        if "role_code" not in payload.model_fields_set and "role" not in payload.model_fields_set:
            requested_role_code = await self._get_default_role_code(organization_id=organization_id)

        role_code = await self._normalize_and_validate_role_code(
            organization_id=organization_id,
            role_code=requested_role_code,
        )

        invite = await OrganizationEmailInvite.create(
            organization_id=organization_id,
            email=email,
            role_code=role_code,
            code=generate_invite_code(prefix="oi"),
            expires_at=build_expires_at(expires_in_seconds=payload.expires_in_seconds),
            created_by_user_id=actor_user_id,
        )

        token = build_invite_token(self.settings, code=invite.code)
        invite_url = self._build_invite_url(token)

        self.logger.info(
            "Organization member invited",
            action="organization_member_invite",
            organization_id=str(organization_id),
            actor_user_id=str(actor_user_id),
            email=email,
            requested_role_code=role_code,
        )

        return OrganizationMemberInviteResult(
            invitation_id=invite.id,
            email=invite.email,
            role_code=role_code,
            token=token,
            invite_url=invite_url,
        )

    async def list_invitations(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        status: str | None,
        mine: bool | None,
    ) -> PageData[OrganizationInvitationOut]:
        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.read",
            error_code="ORG_INVITATIONS_READ_REQUIRED",
        )

        total, rows = await self.repo.list_email_invites(
            organization_id=organization_id,
            params=params,
            q=q,
            ordering=ordering,
            status=status,
            mine=mine,
            current_user_id=actor_user_id,
        )

        user_ids: set[UUID] = set()
        for invite in rows:
            if invite.created_by_user_id is not None:
                user_ids.add(UUID(str(invite.created_by_user_id)))
            if invite.accepted_by_user_id is not None:
                user_ids.add(UUID(str(invite.accepted_by_user_id)))
            if invite.revoked_by_user_id is not None:
                user_ids.add(UUID(str(invite.revoked_by_user_id)))
        users_map = await self.repo.get_users_map(user_ids=list(user_ids))

        items = [self._to_email_invitation_out(invite, users_map=users_map) for invite in rows]

        pages = (total + params.size - 1) // params.size if params.size else 0
        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None

        return PageData[OrganizationInvitationOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def renew_invitation(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        invitation_id: UUID,
        expires_in_seconds: int | None,
    ) -> OrganizationInvitationRenewResult:
        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.revoke",
            error_code="ORG_INVITATIONS_REVOKE_REQUIRED",
        )

        invite = await self.repo.get_email_invite(organization_id=organization_id, invitation_id=invitation_id)
        if invite is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="Not found"), error="NOT_FOUND")

        if invite.accepted_at is not None:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="Invite already accepted"),
                error="INVITE_ALREADY_ACCEPTED",
            )

        if invite.revoked_at is not None:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="Invite already revoked"),
                error="INVITE_REVOKED",
            )

        invite_expires_at = cast(_HasNullableExpiresAt, invite)
        invite_expires_at.expires_at = build_expires_at(expires_in_seconds=expires_in_seconds)
        await invite.save(update_fields=["expires_at", "updated_at"])

        token = build_invite_token(self.settings, code=invite.code)
        invite_url = self._build_invite_url(token)

        users_map = await self.repo.get_users_map(
            user_ids=[
                UUID(str(invite.created_by_user_id)),
                UUID(str(invite.accepted_by_user_id)) if invite.accepted_by_user_id else actor_user_id,
                UUID(str(invite.revoked_by_user_id)) if invite.revoked_by_user_id else actor_user_id,
            ]
        )

        self.logger.info(
            "Organization invitation renewed",
            action="organization_member_invitation_renew",
            organization_id=str(organization_id),
            actor_user_id=str(actor_user_id),
            invitation_id=str(invite.id),
        )

        return OrganizationInvitationRenewResult(
            invitation=self._to_email_invitation_out(invite, users_map=users_map),
            token=token,
            invite_url=invite_url,
        )

    async def revoke_invitation(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        invitation_id: UUID,
    ) -> bool:
        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.revoke",
            error_code="ORG_INVITATIONS_REVOKE_REQUIRED",
        )

        invite = await self.repo.get_email_invite(organization_id=organization_id, invitation_id=invitation_id)
        if invite is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="Not found"), error="NOT_FOUND")

        if invite.accepted_at is not None:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="Invite already accepted"),
                error="INVITE_ALREADY_ACCEPTED",
            )

        if invite.revoked_at is not None:
            return True

        invite.revoked_at = datetime.now(UTC)
        invite.revoked_by_user_id = actor_user_id
        await invite.save(update_fields=["revoked_at", "revoked_by_user_id", "updated_at"])

        self.logger.info(
            "Organization invitation revoked",
            action="organization_member_invitation_revoke",
            organization_id=str(organization_id),
            actor_user_id=str(actor_user_id),
            invitation_id=str(invite.id),
        )

        return True

    async def create_invite_link(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        payload: OrganizationInviteLinkCreateRequest,
    ) -> OrganizationInviteLinkCreateResult:
        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.create",
            error_code="ORG_INVITATIONS_CREATE_REQUIRED",
        )

        requested_role_code = payload.role_code
        if "role_code" not in payload.model_fields_set:
            requested_role_code = await self._get_default_role_code(organization_id=organization_id)

        role_code = await self._normalize_and_validate_role_code(
            organization_id=organization_id,
            role_code=requested_role_code,
        )

        domain = str(payload.allowed_email_domain or "").strip().lower() or None
        if domain and "@" in domain:
            raise BadRequest(message="Domain must not contain @", error="INVALID_EMAIL_DOMAIN")

        link = await OrganizationInviteLink.create(
            organization_id=organization_id,
            role_code=role_code,
            code=generate_invite_code(prefix="ol"),
            display_code=await self._build_display_code(),
            expires_at=build_expires_at(expires_in_seconds=payload.expires_in_seconds),
            max_uses=payload.max_uses,
            allowed_email_domain=domain,
            created_by_user_id=actor_user_id,
        )

        token = build_invite_token(self.settings, code=link.code)
        invite_url = self._build_invite_url(token)
        users_map = await self.repo.get_users_map(user_ids=[actor_user_id])

        out = self._to_invite_link_out(link, users_map=users_map)
        return OrganizationInviteLinkCreateResult(link=out, token=token, invite_url=invite_url)

    async def list_invite_links(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        mine: bool | None,
    ) -> PageData[OrganizationInviteLinkOut]:
        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.read",
            error_code="ORG_INVITATIONS_READ_REQUIRED",
        )

        total, rows = await self.repo.list_invite_links(
            organization_id=organization_id,
            params=params,
            q=q,
            ordering=ordering,
            mine=mine,
            current_user_id=actor_user_id,
        )

        user_ids: set[UUID] = set()
        for link in rows:
            if link.created_by_user_id is not None:
                user_ids.add(UUID(str(link.created_by_user_id)))
            if link.last_used_by_user_id is not None:
                user_ids.add(UUID(str(link.last_used_by_user_id)))
        users_map = await self.repo.get_users_map(user_ids=list(user_ids))

        items = [self._to_invite_link_out(link, users_map=users_map) for link in rows]

        pages = (total + params.size - 1) // params.size if params.size else 0
        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[OrganizationInviteLinkOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def renew_invite_link(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        link_id: UUID,
        expires_in_seconds: int | None,
    ) -> OrganizationInviteLinkRenewResult:
        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.revoke",
            error_code="ORG_INVITATIONS_REVOKE_REQUIRED",
        )

        link = await self.repo.get_invite_link(organization_id=organization_id, link_id=link_id)
        if link is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="Not found"), error="NOT_FOUND")
        if link.disabled_at is not None:
            raise BadRequest(message="Invite link disabled", error="INVITE_LINK_DISABLED")

        link_expires_at = cast(_HasNullableExpiresAt, link)
        link_expires_at.expires_at = build_expires_at(expires_in_seconds=expires_in_seconds)
        await link.save(update_fields=["expires_at", "updated_at"])

        token = build_invite_token(self.settings, code=link.code)
        invite_url = self._build_invite_url(token)
        users_map = await self.repo.get_users_map(
            user_ids=[
                UUID(str(link.created_by_user_id)) if link.created_by_user_id else actor_user_id,
                UUID(str(link.last_used_by_user_id)) if link.last_used_by_user_id else actor_user_id,
            ]
        )
        return OrganizationInviteLinkRenewResult(
            link=self._to_invite_link_out(link, users_map=users_map),
            token=token,
            invite_url=invite_url,
        )

    async def disable_invite_link(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        link_id: UUID,
    ) -> bool:
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.revoke",
            error_code="ORG_INVITATIONS_REVOKE_REQUIRED",
        )
        link = await self.repo.get_invite_link(organization_id=organization_id, link_id=link_id)
        if link is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="Not found"), error="NOT_FOUND")
        if link.disabled_at is not None:
            return True

        link.disabled_at = datetime.now(UTC)
        await link.save(update_fields=["disabled_at", "updated_at"])
        return True

    async def list_invite_link_participants(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        link_id: UUID,
        params: PageParams,
    ) -> PageData[OrganizationInviteLinkParticipantOut]:
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.invitations.read",
            error_code="ORG_INVITATIONS_READ_REQUIRED",
        )
        total, rows = await self.repo.list_invite_link_use_events(
            organization_id=organization_id,
            link_id=link_id,
            params=params,
        )
        user_ids = [UUID(str(row.used_by_user_id)) for row in rows]
        users_map = await self.repo.get_users_map(user_ids=user_ids)

        items: list[OrganizationInviteLinkParticipantOut] = []
        for row in rows:
            user = users_map.get(UUID(str(row.used_by_user_id)))
            if user is None:
                continue
            user_ref = self._user_ref(user)
            if user_ref is None:
                continue
            items.append(
                OrganizationInviteLinkParticipantOut(
                    user=user_ref,
                    used_at=row.used_at,
                )
            )

        pages = (total + params.size - 1) // params.size if params.size else 0
        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[OrganizationInviteLinkParticipantOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def update_member_role(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        target_membership_id: UUID,
        role_code: str,
    ) -> OrganizationMemberOut:
        actor_role = actor_membership.role
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.members.manage",
            error_code="ORG_MEMBERS_MANAGE_REQUIRED",
        )

        normalized_role_code = await self._normalize_and_validate_role_code(
            organization_id=organization_id,
            role_code=role_code,
        )
        normalized_role = self._to_builtin_org_role(normalized_role_code)

        target = await self.repo.get_membership(organization_id=organization_id, membership_id=target_membership_id)
        if target is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="Not found"), error="NOT_FOUND")

        if actor_role != OrgRole.OWNER:
            if target.role == OrgRole.OWNER or normalized_role == OrgRole.OWNER:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED", default="Forbidden"),
                    error="ORG_OWNER_REQUIRED",
                )

        if target.role == OrgRole.OWNER and normalized_role != OrgRole.OWNER:
            owner_count = await self.repo.count_role_memberships(organization_id=organization_id, role=OrgRole.OWNER)
            if owner_count <= 1:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="Invalid request"),
                    error="ORG_OWNER_AT_LEAST_ONE_REQUIRED",
                )

        target.role = normalized_role
        target.role_code = normalized_role_code
        await target.save(update_fields=["role", "role_code", "updated_at"])

        self.logger.info(
            "Organization member role updated",
            action="organization_member_role_update",
            organization_id=str(organization_id),
            actor_user_id=str(cast(HasUserId, actor_membership).user_id),
            target_user_id=str(target.user.id),
            role=str(normalized_role),
            role_code=normalized_role_code,
        )

        workspace_rows = await self.repo.list_workspace_memberships_for_user_ids(
            organization_id=organization_id,
            user_ids=[UUID(str(target.user.id))],
        )
        workspace_items = self._build_workspace_map(workspace_rows).get(UUID(str(target.user.id)), [])

        return OrganizationMemberOut(
            id=target.id,
            membership_id=target.id,
            organization_id=organization_id,
            role=target.role,
            role_code=target.role_code,
            status=target.status,
            user_id=target.user.id,
            username=target.user.username,
            display_name=target.user.display_name,
            email=target.user.email,
            avatar_url=target.user.avatar_url,
            user_status=target.user.status,
            last_login_at=target.user.last_login_at,
            joined_at=target.created_at,
            workspace_count=len(workspace_items),
            workspaces=workspace_items,
        )

    async def remove_member(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        target_membership_id: UUID,
    ) -> OrganizationMemberDeleteResult:
        actor_role = actor_membership.role
        actor_user_id = UUID(str(cast(HasUserId, actor_membership).user_id))
        await self._ensure_permission(
            organization_id=organization_id,
            actor_membership=actor_membership,
            permission_code="org.members.manage",
            error_code="ORG_MEMBERS_MANAGE_REQUIRED",
        )

        target = await self.repo.get_membership(organization_id=organization_id, membership_id=target_membership_id)
        if target is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="Not found"), error="NOT_FOUND")

        target_user_id = UUID(str(target.user.id))

        if actor_role != OrgRole.OWNER and target.role == OrgRole.OWNER:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="Forbidden"),
                error="ORG_OWNER_REQUIRED",
            )

        if target.role == OrgRole.OWNER and actor_user_id == target_user_id:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="Forbidden"),
                error="ORG_OWNER_SELF_REMOVE_FORBIDDEN",
            )

        if target.role == OrgRole.OWNER:
            owner_count = await self.repo.count_role_memberships(organization_id=organization_id, role=OrgRole.OWNER)
            if owner_count <= 1:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="Invalid request"),
                    error="ORG_OWNER_AT_LEAST_ONE_REQUIRED",
                )

        target_membership = UUID(str(target.id))
        await self.repo.disable_workspace_memberships(organization_id=organization_id, user_id=target_user_id)
        await target.delete()

        self.logger.info(
            "Organization member removed",
            action="organization_member_remove",
            organization_id=str(organization_id),
            actor_user_id=str(actor_user_id),
            target_user_id=str(target_user_id),
        )

        return OrganizationMemberDeleteResult(membership_id=target_membership, removed=True)

    async def _ensure_permission(
        self,
        *,
        organization_id: UUID,
        actor_membership: OrgMembership,
        permission_code: str,
        error_code: str = "ORG_PERMISSION_DENIED",
    ) -> None:
        await self.rbac.ensure_permission(
            organization_id=organization_id,
            membership=actor_membership,
            permission_code=permission_code,
            error_code=error_code,
        )

    async def _get_default_role_code(self, *, organization_id: UUID) -> str:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_ORG,
            scope_id=organization_id,
            namespace="core",
        )
        value = record.value if record and isinstance(record.value, dict) else {}
        role_code = value.get("default_role_code") if isinstance(value, dict) else None
        if not isinstance(role_code, str):
            return OrgRole.MEMBER.value
        normalized = role_code.strip().lower()
        return normalized or OrgRole.MEMBER.value

    async def _normalize_and_validate_role_code(self, *, organization_id: UUID, role_code: str | None) -> str:
        code = str(role_code or OrgRole.MEMBER.value).strip().lower()
        if not code:
            code = OrgRole.MEMBER.value

        await self.rbac.ensure_defaults(organization_id=organization_id)
        role = await self.rbac.repo.get_role_by_code(organization_id=organization_id, code=code)
        if role is None:
            raise BadRequest(message="Role code not found", error="ROLE_CODE_NOT_FOUND")
        return role.code

    def _to_builtin_org_role(self, role_code: str) -> OrgRole:
        if role_code == OrgRole.OWNER.value:
            return OrgRole.OWNER
        if role_code == OrgRole.ADMIN.value:
            return OrgRole.ADMIN
        return OrgRole.MEMBER

    def _build_workspace_map(
        self,
        memberships: list[WorkspaceMembership],
    ) -> dict[UUID, list[OrganizationMemberWorkspaceOut]]:
        out: dict[UUID, list[OrganizationMemberWorkspaceOut]] = {}

        for membership in memberships:
            membership_with_rel = cast(_WorkspaceMembershipWithRelations, membership)
            user_id = UUID(str(cast(HasUserId, membership).user_id))
            workspace = membership_with_rel.workspace
            if workspace is None:
                continue

            role_codes = sorted({
                str(binding.role.code)
                for binding in (membership_with_rel.membership_roles or [])
                if getattr(binding, "role", None) is not None and getattr(binding.role, "code", None)
            })

            out.setdefault(user_id, []).append(
                OrganizationMemberWorkspaceOut(
                    workspace_id=UUID(str(workspace.id)),
                    workspace_name=workspace.name,
                    workspace_slug=workspace.slug,
                    membership_status=str(membership.status),
                    role_codes=role_codes,
                    joined_at=membership.created_at,
                )
            )

        return out

    def _sort_members(self, *, items: list[OrganizationMemberOut], ordering: str | None) -> list[OrganizationMemberOut]:
        out = list(items)
        normalized_fields = _normalize_member_ordering(ordering)
        for raw in reversed(normalized_fields):
            desc = raw.startswith("-")
            name = raw[1:] if desc else raw
            out.sort(
                key=lambda item, field=name: self._member_sort_key(item=item, field=field),
                reverse=desc,
            )
        return out

    def _member_sort_key(self, *, item: OrganizationMemberOut, field: str) -> tuple[int, Any]:
        if field == "joined_at":
            return self._normalize_sort_value(item.joined_at)
        if field == "username":
            return self._normalize_sort_value(item.username)
        if field == "email":
            return self._normalize_sort_value(item.email)
        if field == "display_name":
            return self._normalize_sort_value(item.display_name)
        if field == "role_code":
            return self._normalize_sort_value(item.role_code)
        if field == "status":
            return self._normalize_sort_value(item.status)
        if field == "user_status":
            return self._normalize_sort_value(item.user_status)
        if field == "workspace_count":
            return self._normalize_sort_value(item.workspace_count)
        if field == "last_login_at":
            return self._normalize_sort_value(item.last_login_at)
        return self._normalize_sort_value(item.joined_at)

    def _normalize_sort_value(self, value: Any) -> tuple[int, Any]:
        if value is None:
            return (1, "")
        if isinstance(value, str):
            return (0, value.lower())
        return (0, value)

    def _compute_invitation_status(
        self,
        *,
        accepted_at: datetime | None,
        revoked_at: datetime | None,
        expires_at: datetime | None,
    ) -> str:
        if accepted_at is not None:
            return "accepted"
        if revoked_at is not None:
            return "revoked"
        if expires_at is not None and expires_at <= datetime.now(UTC):
            return "expired"
        return "pending"

    def _user_ref(self, user: User | None) -> OrganizationInvitationUserRefOut | None:
        if user is None:
            return None
        return OrganizationInvitationUserRefOut(
            user_id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
        )

    def _to_email_invitation_out(
        self,
        invitation: OrganizationEmailInvite,
        *,
        users_map: dict[UUID, User],
    ) -> OrganizationInvitationOut:
        created_by = users_map.get(UUID(str(invitation.created_by_user_id))) if invitation.created_by_user_id else None
        accepted_by = (
            users_map.get(UUID(str(invitation.accepted_by_user_id))) if invitation.accepted_by_user_id else None
        )
        revoked_by = users_map.get(UUID(str(invitation.revoked_by_user_id))) if invitation.revoked_by_user_id else None
        return OrganizationInvitationOut(
            id=invitation.id,
            invitation_type="email",
            email=invitation.email,
            display_code=None,
            role_code=invitation.role_code,
            expires_at=invitation.expires_at,
            created_by_user_id=invitation.created_by_user_id,
            created_by=self._user_ref(created_by),
            accepted_by_user_id=invitation.accepted_by_user_id,
            accepted_by=self._user_ref(accepted_by),
            revoked_by_user_id=invitation.revoked_by_user_id,
            revoked_by=self._user_ref(revoked_by),
            accepted_at=invitation.accepted_at,
            revoked_at=invitation.revoked_at,
            status=self._compute_invitation_status(
                accepted_at=invitation.accepted_at,
                revoked_at=invitation.revoked_at,
                expires_at=invitation.expires_at,
            ),
            created_at=invitation.created_at,
            updated_at=invitation.updated_at,
        )

    def _to_invite_link_out(
        self,
        link: OrganizationInviteLink,
        *,
        users_map: dict[UUID, User],
    ) -> OrganizationInviteLinkOut:
        created_by = users_map.get(UUID(str(link.created_by_user_id))) if link.created_by_user_id else None
        last_used_by = users_map.get(UUID(str(link.last_used_by_user_id))) if link.last_used_by_user_id else None
        token = build_invite_token(self.settings, code=link.code)
        invite_url = self._build_invite_url(token)
        return OrganizationInviteLinkOut(
            id=link.id,
            display_code=link.display_code,
            role_code=link.role_code,
            expires_at=link.expires_at,
            disabled_at=link.disabled_at,
            max_uses=link.max_uses,
            allowed_email_domain=link.allowed_email_domain,
            token=token,
            invite_url=invite_url,
            created_by_user_id=link.created_by_user_id,
            created_by=self._user_ref(created_by),
            last_used_by_user_id=link.last_used_by_user_id,
            last_used_by=self._user_ref(last_used_by),
            last_used_at=link.last_used_at,
            uses_count=int(link.uses_count or 0),
            created_at=link.created_at,
            updated_at=link.updated_at,
        )

    async def _build_display_code(self) -> str:
        for _ in range(5):
            display_code = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
            if not display_code:
                continue
            if not await OrganizationInviteLink.filter(display_code=display_code).exists():
                return display_code
        raise BadRequest(
            message=t("errors", "FAILED_TO_CREATE_INVITE_LINK", default="创建邀请链接失败"),
            error="FAILED_TO_CREATE_INVITE_LINK",
        )

    def _build_invite_url(self, token: str) -> str | None:
        base = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
        if not base:
            return None
        return f"{base}/invitations?token={token}"
