from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from src.common.invitations.tokens import verify_invite_token
from src.common.invitations.workspace_invites import (
    is_workspace_email_invite_code,
    is_workspace_guest_invite_code,
    is_workspace_invite_link_code,
)
from src.common.protocols.tortoise import HasOrganizationId, HasWorkspaceId
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.system.access_restriction import (
    AccessRestrictionEntityType,
    AccessRestrictionType,
)
from src.models.system.notification import NotificationCategory
from src.models.system.rbac import SystemRole
from src.models.workspaces.workspace import (
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.models.workspaces.workspace_invite import (
    WorkspaceEmailInvite,
    WorkspaceInviteLink,
    WorkspaceInviteLinkUseEvent,
)
from src.modules.access_restrictions.repository import AccessRestrictionRepository
from src.modules.access_restrictions.service import AccessRestrictionAuthority
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.onboarding.service import WorkspaceFirstOnboardingService
from src.modules.auth.repository import UserRepository
from src.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    TokenPair,
)
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.projects.repository import ProjectRepository
from src.modules.system.admin.notifications.catalog import create_notification_record


class AuthInvitationAcceptanceService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        onboarding_service: WorkspaceFirstOnboardingService | None = None,
        restriction_authority: AccessRestrictionAuthority | None = None,
    ) -> None:
        super().__init__(settings)
        self.project_repo = ProjectRepository()
        self.user_repo = UserRepository()
        self.workspace_repo = OrganizationWorkspaceRepository()
        self.onboarding_service = onboarding_service or WorkspaceFirstOnboardingService(settings)
        self.restriction_authority = restriction_authority or AccessRestrictionAuthority(AccessRestrictionRepository())

    async def _require_workspace_unrestricted(self, *, workspace_id: UUID) -> None:
        await self.restriction_authority.require_unrestricted(
            entity_type=AccessRestrictionEntityType.WORKSPACE,
            entity_id=workspace_id,
            restriction_types=[
                AccessRestrictionType.WORKSPACE_SUSPENDED,
                AccessRestrictionType.WORKSPACE_ARCHIVED,
            ],
        )

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    async def _write_invite_accepted_activity_event(
        self,
        *,
        organization_id: UUID,
        actor_user_id: UUID,
        inviter_user_id: UUID | None,
        invite_kind: str,
        conn,
    ) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="organization.invite.accepted",
                organization_id=organization_id,
                source="api",
                actor_user_id=actor_user_id,
                subject_user_id=actor_user_id,
                entity_type="organization",
                entity_id=organization_id,
                properties={
                    "inviter_user_id": str(inviter_user_id) if inviter_user_id else None,
                    "invite_kind": invite_kind,
                },
            ),
            conn=conn,
        )

    async def accept_invitation(
        self,
        *,
        payload: AcceptInvitationRequest,
        ensure_password_strength: Callable[[str], None],
        issue_tokens: Callable[..., Awaitable[TokenPair]],
        ensure_role_codes_have_admin_access: Callable[..., Awaitable[None]],
    ) -> TokenPair:
        token = payload.token.strip()
        if not token:
            raise BadRequest(message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"), error="INVITE_TOKEN_INVALID")

        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"), error="INVITE_TOKEN_INVALID")

        now = datetime.now(UTC)

        inviter_user_id: UUID | None = None
        accepted_user_id: UUID | None = None
        accepted_display_name: str | None = None
        organization_id: UUID | None = None
        workspace_id: UUID | None = None

        async with self.tx() as conn:
            assigned_role_code: str | None = None
            invite_email: str | None = None
            invite_link: WorkspaceInviteLink | None = None
            email_inv: WorkspaceEmailInvite | None = None

            if is_workspace_invite_link_code(code):
                invite_link = await WorkspaceInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                if invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if invite_link.expires_at is not None and invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                if invite_link.max_uses is not None and int(invite_link.uses_count or 0) >= int(invite_link.max_uses):
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请不可用"), error="INVITE_MAX_USES_REACHED")

                organization_id = UUID(str(cast(HasOrganizationId, invite_link).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, invite_link).workspace_id))
                inviter_user_id = invite_link.created_by_user_id
                assigned_role_code = invite_link.role_code

                invite_email = (payload.email or "").strip().lower()
                if not invite_email:
                    raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")

                allowed_domain = (invite_link.allowed_email_domain or "").strip().lower().lstrip("@").strip()
                if allowed_domain:
                    if "@" not in invite_email:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
                    domain = invite_email.split("@", 1)[1].strip().lower()
                    if domain != allowed_domain:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
            elif is_workspace_email_invite_code(code):
                email_inv = await WorkspaceEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
                if email_inv is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if email_inv.revoked_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if email_inv.accepted_at is not None:
                    raise Conflict(message=self._ta("INVITE_REVOKED", "邀请不可用"), error="INVITE_ALREADY_ACCEPTED")
                if email_inv.expires_at is not None and email_inv.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

                organization_id = UUID(str(cast(HasOrganizationId, email_inv).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, email_inv).workspace_id))
                inviter_user_id = email_inv.created_by_user_id
                assigned_role_code = email_inv.role_code

                invite_email = (email_inv.email or "").strip().lower()
                if payload.email is not None:
                    provided = str(payload.email).strip().lower()
                    if provided and provided != invite_email:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"), error="INVITE_EMAIL_MISMATCH"
                        )
            else:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            if organization_id is None or workspace_id is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            ws = await self.workspace_repo.get_by_id_for_update(workspace_id, conn=conn)
            if ws is None:
                raise Forbidden(message=t("errors", "NOT_FOUND"), error="WORKSPACE_INACTIVE")
            await self._require_workspace_unrestricted(workspace_id=workspace_id)
            if not ws.is_active or ws.archived_at is not None:
                raise Forbidden(message=t("errors", "NOT_FOUND"), error="WORKSPACE_INACTIVE")
            if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
                raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="CROSS_ORG_ACCESS_DENIED")

            username = payload.username.strip()
            email = (invite_email or "").strip().lower()
            display_name = payload.display_name.strip() if payload.display_name else None

            if not username:
                raise BadRequest(message=self._ta("USERNAME_REQUIRED", "用户名不能为空"), error="USERNAME_REQUIRED")
            if not email:
                raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")

            if await self.user_repo.exists_username_in_connection(username, conn=conn):
                raise Conflict(message=self._ta("USERNAME_EXISTS", "用户名已存在"), error="USERNAME_EXISTS")
            if await self.user_repo.exists_email_in_connection(email, conn=conn):
                raise Conflict(message=self._ta("EMAIL_EXISTS", "邮箱已存在"), error="EMAIL_EXISTS")

            ensure_password_strength(payload.password)

            password_hash = hash_password(payload.password, self.settings.auth)
            user = await self.user_repo.create_user_in_connection(
                conn=conn,
                username=username,
                email=email,
                display_name=display_name,
                password_hash=password_hash,
            )

            join_as_guest = bool(is_workspace_guest_invite_code(code))
            if not join_as_guest:
                await OrgMembership.create(
                    using_db=conn,
                    organization_id=organization_id,
                    user_id=user.id,
                    role=OrgRole.MEMBER,
                    role_code=OrgRole.MEMBER.value,
                    status="active",
                )

            wsm: WorkspaceMembership | None = None
            roles: list[SystemRole] = []
            existing_wsm = await WorkspaceMembership.get_or_none(
                user_id=user.id, workspace_id=workspace_id, using_db=conn
            )
            if existing_wsm is not None and existing_wsm.status == WorkspaceMembershipStatus.ACTIVE:
                raise Conflict(
                    message=self._ta("INVITE_ALREADY_MEMBER", "你已是该工作区的成员"), error="INVITE_ALREADY_MEMBER"
                )

            wsm, _created = await WorkspaceMembership.get_or_create(
                using_db=conn,
                user_id=user.id,
                workspace_id=workspace_id,
                defaults={"status": WorkspaceMembershipStatus.ACTIVE, "invited_by_user_id": inviter_user_id},
            )
            if wsm.status != WorkspaceMembershipStatus.ACTIVE:
                wsm.status = WorkspaceMembershipStatus.ACTIVE
                await wsm.save(using_db=conn, update_fields=["status"])

            if assigned_role_code:
                role = await SystemRole.get_or_none(workspace_id=workspace_id, code=assigned_role_code, using_db=conn)
                if role is not None:
                    roles = [role]
            else:
                roles = await SystemRole.filter(workspace_id=workspace_id, is_default=True).using_db(conn).all()

            for role in roles:
                await WorkspaceMembershipRole.get_or_create(using_db=conn, membership_id=wsm.id, role_id=role.id)

            await ensure_role_codes_have_admin_access(
                workspace_id=workspace_id, role_codes=[r.code for r in roles], conn=conn
            )
            await self.onboarding_service.complete_existing_workspace_if_pending(
                user_id=user.id,
                workspace_id=workspace_id,
                conn=conn,
            )

            if email_inv is not None:
                email_inv.accepted_by_user_id = user.id
                email_inv.accepted_at = now
                await email_inv.save(using_db=conn, update_fields=["accepted_by_user_id", "accepted_at"])

            if invite_link is not None:
                invite_link.uses_count = int(invite_link.uses_count or 0) + 1
                invite_link.last_used_by_user_id = user.id
                invite_link.last_used_at = now
                await invite_link.save(
                    using_db=conn, update_fields=["uses_count", "last_used_by_user_id", "last_used_at"]
                )
                await WorkspaceInviteLinkUseEvent.create(
                    using_db=conn,
                    link_id=invite_link.id,
                    used_by_user_id=user.id,
                    used_at=now,
                    joined_membership_id=wsm.id if wsm is not None else None,
                )

            accepted_user_id = user.id
            accepted_display_name = user.display_name or user.username

            await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="workspace.invite.accepted",
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    source="api",
                    actor_user_id=accepted_user_id,
                    properties={
                        "inviter_user_id": str(inviter_user_id) if inviter_user_id else None,
                        "invite_kind": "link" if is_workspace_invite_link_code(code) else "email",
                    },
                ),
                conn=conn,
            )

        tokens = await issue_tokens(identifier=payload.username, password=payload.password)

        if inviter_user_id is not None and accepted_user_id is not None and workspace_id is not None:
            await create_notification_record(
                settings=self.settings,
                workspace_id=workspace_id,
                recipient_user_id=inviter_user_id,
                actor_user_id=accepted_user_id,
                category=NotificationCategory.TEAM,
                title=t(
                    "notifications",
                    "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
                    default="{name} joined the workspace",
                    name=accepted_display_name or "新成员",
                ),
                body=t(
                    "notifications",
                    "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
                    default="The user accepted the workspace invitation.",
                ),
                target_to="/settings/team/members",
                target_meta=None,
                event_name="workspace.invitation.accepted",
                dedupe_key=f"workspace.invitation.accepted:{code}",
            )

        return tokens

    async def accept_existing_invitation(
        self,
        *,
        payload: AcceptExistingInvitationRequest,
        user: User,
        ensure_role_codes_have_admin_access: Callable[..., Awaitable[None]],
    ) -> AcceptExistingInvitationResult:
        token = (payload.token or "").strip()
        if not token:
            raise BadRequest(message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"), error="INVITE_TOKEN_INVALID")

        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"), error="INVITE_TOKEN_INVALID")

        now = datetime.now(UTC)

        inviter_user_id: UUID | None = None
        workspace_id: UUID | None = None
        organization_id: UUID | None = None
        assigned_role_code: str | None = None
        did_accept = False

        async with self.tx() as conn:
            invite_link: WorkspaceInviteLink | None = None
            email_inv: WorkspaceEmailInvite | None = None
            is_repeated_acceptance = False

            if is_workspace_invite_link_code(code):
                invite_link = await WorkspaceInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                if invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if invite_link.expires_at is not None and invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                is_repeated_acceptance = (
                    await WorkspaceInviteLinkUseEvent
                    .filter(
                        link_id=invite_link.id,
                        used_by_user_id=user.id,
                    )
                    .using_db(conn)
                    .exists()
                )
                if (
                    not is_repeated_acceptance
                    and invite_link.max_uses is not None
                    and int(invite_link.uses_count or 0) >= int(invite_link.max_uses)
                ):
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请不可用"), error="INVITE_MAX_USES_REACHED")

                organization_id = UUID(str(cast(HasOrganizationId, invite_link).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, invite_link).workspace_id))
                inviter_user_id = invite_link.created_by_user_id
                assigned_role_code = invite_link.role_code

                user_email = (user.email or "").strip().lower()
                if not user_email:
                    raise Forbidden(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")
                allowed_domain = (invite_link.allowed_email_domain or "").strip().lower()
                if allowed_domain.startswith("@"):
                    allowed_domain = allowed_domain[1:]
                if allowed_domain:
                    if "@" not in user_email:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
                    domain = user_email.split("@", 1)[1].strip().lower()
                    if domain != allowed_domain:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邮箱不符合要求"),
                            error="INVITE_EMAIL_DOMAIN_FORBIDDEN",
                        )
            elif is_workspace_email_invite_code(code):
                email_inv = await WorkspaceEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
                if email_inv is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if email_inv.revoked_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                is_repeated_acceptance = bool(
                    email_inv.accepted_at is not None and email_inv.accepted_by_user_id == user.id
                )
                if email_inv.accepted_at is not None and not is_repeated_acceptance:
                    raise Conflict(message=self._ta("INVITE_REVOKED", "邀请不可用"), error="INVITE_ALREADY_ACCEPTED")
                if email_inv.expires_at is not None and email_inv.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

                organization_id = UUID(str(cast(HasOrganizationId, email_inv).organization_id))
                workspace_id = UUID(str(cast(HasWorkspaceId, email_inv).workspace_id))
                inviter_user_id = email_inv.created_by_user_id
                assigned_role_code = email_inv.role_code

                user_email = (user.email or "").strip().lower()
                invite_email = (email_inv.email or "").strip().lower()
                if not user_email or user_email != invite_email:
                    raise Forbidden(
                        message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"), error="INVITE_EMAIL_MISMATCH"
                    )
            else:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            if workspace_id is None or organization_id is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            ws = await self.workspace_repo.get_by_id_for_update(workspace_id, conn=conn)
            if ws is None:
                raise Forbidden(message=t("errors", "NOT_FOUND"), error="WORKSPACE_INACTIVE")
            await self._require_workspace_unrestricted(workspace_id=workspace_id)
            if not ws.is_active or ws.archived_at is not None:
                raise Forbidden(message=t("errors", "NOT_FOUND"), error="WORKSPACE_INACTIVE")
            if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
                raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="CROSS_ORG_ACCESS_DENIED")

            existing_orgm = (
                await OrgMembership
                .filter(
                    user_id=user.id,
                    organization_id=organization_id,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )

            join_as_guest = bool(is_workspace_guest_invite_code(code))
            if not join_as_guest and existing_orgm is None:
                await OrgMembership.create(
                    using_db=conn,
                    organization_id=organization_id,
                    user_id=user.id,
                    role=OrgRole.MEMBER,
                    role_code=OrgRole.MEMBER.value,
                    status="active",
                )

            existing_wsm = await WorkspaceMembership.get_or_none(
                user_id=user.id, workspace_id=workspace_id, using_db=conn
            )

            if is_repeated_acceptance:
                accepted_display_name = user.display_name or user.username
            else:
                did_accept = True

                wsm, _created = await WorkspaceMembership.get_or_create(
                    using_db=conn,
                    user_id=user.id,
                    workspace_id=workspace_id,
                    defaults={"status": WorkspaceMembershipStatus.ACTIVE, "invited_by_user_id": inviter_user_id},
                )
                if wsm.status != WorkspaceMembershipStatus.ACTIVE:
                    wsm.status = WorkspaceMembershipStatus.ACTIVE
                    await wsm.save(using_db=conn, update_fields=["status"])

                roles: list[SystemRole] = []
                if assigned_role_code:
                    role = await SystemRole.get_or_none(
                        workspace_id=workspace_id,
                        code=assigned_role_code,
                        using_db=conn,
                    )
                    if role is not None:
                        roles = [role]
                else:
                    roles = await SystemRole.filter(workspace_id=workspace_id, is_default=True).using_db(conn).all()
                for role in roles:
                    await WorkspaceMembershipRole.get_or_create(using_db=conn, membership_id=wsm.id, role_id=role.id)
                await ensure_role_codes_have_admin_access(
                    workspace_id=workspace_id, role_codes=[r.code for r in roles], conn=conn
                )
                await self.onboarding_service.complete_existing_workspace_if_pending(
                    user_id=user.id,
                    workspace_id=workspace_id,
                    conn=conn,
                )

                if email_inv is not None:
                    email_inv.accepted_by_user_id = user.id
                    email_inv.accepted_at = now
                    await email_inv.save(using_db=conn, update_fields=["accepted_by_user_id", "accepted_at"])

                if invite_link is not None:
                    invite_link.uses_count = int(invite_link.uses_count or 0) + 1
                    invite_link.last_used_by_user_id = user.id
                    invite_link.last_used_at = now
                    await invite_link.save(
                        using_db=conn, update_fields=["uses_count", "last_used_by_user_id", "last_used_at"]
                    )
                    await WorkspaceInviteLinkUseEvent.create(
                        using_db=conn,
                        link_id=invite_link.id,
                        used_by_user_id=user.id,
                        used_at=now,
                        joined_membership_id=wsm.id,
                    )

                accepted_display_name = user.display_name or user.username

                await write_required_activity_event(
                    settings=self.settings,
                    payload=ActivityAuditPayload(
                        event_name="workspace.invite.accepted",
                        organization_id=organization_id,
                        workspace_id=workspace_id,
                        source="api",
                        actor_user_id=user.id,
                        properties={
                            "inviter_user_id": str(inviter_user_id) if inviter_user_id else None,
                            "invite_kind": "link" if is_workspace_invite_link_code(code) else "email",
                            "already_member": bool(
                                existing_wsm is not None and existing_wsm.status == WorkspaceMembershipStatus.ACTIVE
                            ),
                        },
                    ),
                    conn=conn,
                )

        if did_accept and inviter_user_id is not None and workspace_id is not None:
            await create_notification_record(
                settings=self.settings,
                workspace_id=workspace_id,
                recipient_user_id=inviter_user_id,
                actor_user_id=user.id,
                category=NotificationCategory.TEAM,
                title=t(
                    "notifications",
                    "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
                    default="{name} joined the workspace",
                    name=accepted_display_name or "新成员",
                ),
                body=t(
                    "notifications",
                    "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
                    default="The user accepted the workspace invitation.",
                ),
                target_to="/settings/team/members",
                target_meta=None,
                event_name="workspace.invitation.accepted",
                dedupe_key=f"workspace.invitation.accepted:{code}",
            )

        project_id = None
        if workspace_id is not None:
            project = await self.project_repo.get_first_project_by_workspace_id(workspace_id=workspace_id)
            project_id = project.id if project is not None else None

        return AcceptExistingInvitationResult(
            workspace_id=workspace_id,
            project_id=project_id,
            role_code=assigned_role_code,
        )
