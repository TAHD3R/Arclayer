from __future__ import annotations

import asyncio
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
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable
from src.core.i18n import t
from src.core.services import BaseService
from src.models.organization.org_invitation import (
    OrganizationEmailInvite,
    OrganizationInviteLink,
    OrganizationInviteLinkUseEvent,
)
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.system.rbac import Role
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
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.repository import UserRepository
from src.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    TokenPair,
)
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.projects.repository import ProjectRepository
from src.modules.system.admin.notifications.preferences import (
    is_notification_channel_enabled_for_event,
)

_FATAL_INVITATION_FLOW_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_INVITATION_FLOW_ERRORS):
        raise exc


class AuthInvitationAcceptanceService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.project_repo = ProjectRepository()
        self.user_repo = UserRepository()
        self.organization_repo = OrganizationRepository()
        self.workspace_repo = OrganizationWorkspaceRepository()

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

    @staticmethod
    def _to_builtin_org_role(role_code: str | None) -> OrgRole:
        code = str(role_code or "").strip().lower()
        if code == OrgRole.OWNER.value:
            return OrgRole.OWNER
        if code == OrgRole.ADMIN.value:
            return OrgRole.ADMIN
        return OrgRole.MEMBER

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
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

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
            org_invite_link: OrganizationInviteLink | None = None
            org_email_inv: OrganizationEmailInvite | None = None
            is_org_scope = False

            if is_workspace_invite_link_code(code):
                invite_link = await WorkspaceInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                if invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if invite_link.expires_at is not None and invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                if invite_link.max_uses is not None and int(invite_link.uses_count or 0) >= int(invite_link.max_uses):
                    raise Forbidden(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_MAX_USES_REACHED",
                    )

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
                    raise Conflict(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_ALREADY_ACCEPTED",
                    )
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
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"),
                            error="INVITE_EMAIL_MISMATCH",
                        )
            elif code.startswith("ol_"):
                org_invite_link = (
                    await OrganizationInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                )
                if org_invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if org_invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if org_invite_link.expires_at is not None and org_invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                if org_invite_link.max_uses is not None and int(org_invite_link.uses_count or 0) >= int(
                    org_invite_link.max_uses
                ):
                    raise Forbidden(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_MAX_USES_REACHED",
                    )

                organization_id = UUID(str(cast(HasOrganizationId, org_invite_link).organization_id))
                inviter_user_id = org_invite_link.created_by_user_id
                assigned_role_code = org_invite_link.role_code
                is_org_scope = True

                invite_email = (payload.email or "").strip().lower()
                if not invite_email:
                    raise BadRequest(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")

                allowed_domain = (org_invite_link.allowed_email_domain or "").strip().lower().lstrip("@").strip()
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
            elif code.startswith("oi_"):
                org_email_inv = (
                    await OrganizationEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
                )
                if org_email_inv is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if org_email_inv.revoked_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if org_email_inv.accepted_at is not None:
                    raise Conflict(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_ALREADY_ACCEPTED",
                    )
                if org_email_inv.expires_at is not None and org_email_inv.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

                organization_id = UUID(str(cast(HasOrganizationId, org_email_inv).organization_id))
                inviter_user_id = org_email_inv.created_by_user_id
                assigned_role_code = org_email_inv.role_code
                is_org_scope = True

                invite_email = (org_email_inv.email or "").strip().lower()
                if payload.email is not None:
                    provided = str(payload.email).strip().lower()
                    if provided and provided != invite_email:
                        raise Forbidden(
                            message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"),
                            error="INVITE_EMAIL_MISMATCH",
                        )
            else:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            if organization_id is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            org = await self.organization_repo.get_by_id_in_connection(organization_id, conn=conn)
            if org is None or not org.is_active:
                raise Forbidden(message=self._ta("ORG_INACTIVE", "组织不可用"), error="ORG_INACTIVE")
            if not is_org_scope:
                if workspace_id is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                ws = await self.workspace_repo.get_by_id_in_connection(workspace_id, conn=conn)
                if ws is None or not ws.is_active or ws.archived_at is not None:
                    raise Forbidden(
                        message=t("errors", "NOT_FOUND"),
                        error="WORKSPACE_INACTIVE",
                    )
                if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
                    raise Forbidden(
                        message=t("errors", "PERMISSION_DENIED"),
                        error="CROSS_ORG_ACCESS_DENIED",
                    )

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

            join_as_guest = bool((not is_org_scope) and is_workspace_guest_invite_code(code))

            # Workspace invitations never imply organization governance elevation.
            #
            # Join modes:
            # - member: join org + workspace (OrgMembership role=member)
            # - guest: join workspace only (no OrgMembership)
            if not join_as_guest:
                normalized_org_role = self._to_builtin_org_role(assigned_role_code) if is_org_scope else OrgRole.MEMBER
                org_membership_role_code = (
                    str(assigned_role_code or "").strip().lower()
                    if is_org_scope and assigned_role_code
                    else normalized_org_role.value
                )
                await OrgMembership.create(
                    using_db=conn,
                    organization_id=organization_id,
                    user_id=user.id,
                    role=normalized_org_role,
                    role_code=org_membership_role_code,
                    status="active",
                )

            roles: list[Role] = []
            wsm: WorkspaceMembership | None = None
            if not is_org_scope:
                if workspace_id is None:
                    raise ServiceUnavailable(
                        message=t("errors", "SERVICE_UNAVAILABLE"),
                        error="SERVICE_UNAVAILABLE",
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
                    role = await Role.get_or_none(workspace_id=workspace_id, code=assigned_role_code, using_db=conn)
                    if role is not None:
                        roles = [role]
                else:
                    roles = await Role.filter(workspace_id=workspace_id, is_default=True).using_db(conn).all()

                for role in roles:
                    await WorkspaceMembershipRole.get_or_create(using_db=conn, membership_id=wsm.id, role_id=role.id)

                await ensure_role_codes_have_admin_access(
                    workspace_id=workspace_id, role_codes=[r.code for r in roles], conn=conn
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
                    using_db=conn,
                    update_fields=["uses_count", "last_used_by_user_id", "last_used_at"],
                )
                await WorkspaceInviteLinkUseEvent.create(
                    using_db=conn,
                    link_id=invite_link.id,
                    used_by_user_id=user.id,
                    used_at=now,
                    joined_membership_id=wsm.id if wsm is not None else None,
                )

            if org_email_inv is not None:
                org_email_inv.accepted_by_user_id = user.id
                org_email_inv.accepted_at = now
                await org_email_inv.save(using_db=conn, update_fields=["accepted_by_user_id", "accepted_at"])

            if org_invite_link is not None:
                org_invite_link.uses_count = int(org_invite_link.uses_count or 0) + 1
                org_invite_link.last_used_by_user_id = user.id
                org_invite_link.last_used_at = now
                await org_invite_link.save(
                    using_db=conn,
                    update_fields=["uses_count", "last_used_by_user_id", "last_used_at"],
                )
                joined_orgm = await OrgMembership.filter(user_id=user.id).using_db(conn).first()
                await OrganizationInviteLinkUseEvent.create(
                    using_db=conn,
                    link_id=org_invite_link.id,
                    used_by_user_id=user.id,
                    used_at=now,
                    joined_membership_id=joined_orgm.id if joined_orgm is not None else None,
                )

            accepted_user_id = user.id
            accepted_display_name = user.display_name or user.username

            if organization_id is not None and workspace_id is not None:
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
            elif organization_id is not None and is_org_scope:
                await self._write_invite_accepted_activity_event(
                    organization_id=organization_id,
                    actor_user_id=accepted_user_id,
                    inviter_user_id=inviter_user_id,
                    invite_kind="link" if code.startswith("ol_") else "email",
                    conn=conn,
                )

        tokens = await issue_tokens(identifier=payload.username, password=payload.password)

        # Best-effort: notify inviter that the invite was accepted.
        # This must never break the onboarding flow if notification creation fails.
        if inviter_user_id is not None and accepted_user_id is not None:
            try:
                from src.models.system.notification import NotificationCategory, NotificationRecord
                from src.models.system.setting import SettingRecord
                from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

                # Optional gate: allow disabling invite-related in-app notifications.
                try:
                    core = await SettingRecord.get_or_none(
                        scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace="core"
                    )
                    v = core.value if core and isinstance(core.value, dict) else {}
                    notifications_cfg = v.get("notifications")
                    invite_enabled = True
                    if isinstance(notifications_cfg, dict) and isinstance(
                        notifications_cfg.get("invite_enabled"), bool
                    ):
                        invite_enabled = bool(notifications_cfg.get("invite_enabled"))
                except BaseException as exc:
                    _raise_if_fatal(exc)
                    invite_enabled = True
                    self.logger.warning(
                        "Invite notification switch resolve failed",
                        action="resolve_invite_notification_switch",
                        org_id=str(organization_id),
                        inviter_user_id=str(inviter_user_id),
                        error=str(exc),
                    )

                if invite_enabled:
                    is_org_invite = code.startswith("oi_") or code.startswith("ol_")
                    if not is_org_invite and workspace_id is not None:
                        in_app_enabled = await is_notification_channel_enabled_for_event(
                            user_id=inviter_user_id,
                            event_name="team.invitation.accepted",
                            channel="in_app",
                        )
                        if in_app_enabled:
                            await NotificationRecord.create(
                                workspace_id=workspace_id,
                                recipient_user_id=inviter_user_id,
                                actor_user_id=accepted_user_id,
                                category=NotificationCategory.TEAM,
                                title=t(
                                    "notifications",
                                    "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_TITLE",
                                    default="{name} accepted the invitation",
                                    name=accepted_display_name or "新成员",
                                ),
                                body=t(
                                    "notifications",
                                    "NOTIFICATIONS_TEAM_INVITE_ACCEPTED_BODY",
                                    default="The user accepted the workspace invitation.",
                                ),
                                target_to="/settings/team/members",
                                target_meta=None,
                                event_name="team.invitation.accepted",
                                dedupe_key=f"workspace.invitation.accepted:{code}",
                            )
            except BaseException as exc:
                _raise_if_fatal(exc)
                self.logger.warning(
                    "Notification create failed (invite accepted)",
                    error=str(exc),
                    org_id=str(organization_id),
                    inviter_user_id=str(inviter_user_id),
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
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        now = datetime.now(UTC)

        inviter_user_id: UUID | None = None
        organization_id: UUID | None = None
        workspace_id: UUID | None = None
        assigned_role_code: str | None = None

        async with self.tx() as conn:
            invite_link: WorkspaceInviteLink | None = None
            email_inv: WorkspaceEmailInvite | None = None
            org_invite_link: OrganizationInviteLink | None = None
            org_email_inv: OrganizationEmailInvite | None = None
            is_org_scope = False

            if is_workspace_invite_link_code(code):
                invite_link = await WorkspaceInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                if invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if invite_link.expires_at is not None and invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                if invite_link.max_uses is not None and int(invite_link.uses_count or 0) >= int(invite_link.max_uses):
                    raise Forbidden(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_MAX_USES_REACHED",
                    )

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
                if email_inv.accepted_at is not None:
                    raise Conflict(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_ALREADY_ACCEPTED",
                    )
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
                        message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"),
                        error="INVITE_EMAIL_MISMATCH",
                    )
            elif code.startswith("ol_"):
                org_invite_link = (
                    await OrganizationInviteLink.filter(code=code).using_db(conn).select_for_update().first()
                )
                if org_invite_link is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if org_invite_link.disabled_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if org_invite_link.expires_at is not None and org_invite_link.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
                if org_invite_link.max_uses is not None and int(org_invite_link.uses_count or 0) >= int(
                    org_invite_link.max_uses
                ):
                    raise Forbidden(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_MAX_USES_REACHED",
                    )

                organization_id = UUID(str(cast(HasOrganizationId, org_invite_link).organization_id))
                inviter_user_id = org_invite_link.created_by_user_id
                assigned_role_code = org_invite_link.role_code
                is_org_scope = True

                user_email = (user.email or "").strip().lower()
                if not user_email:
                    raise Forbidden(message=self._ta("EMAIL_REQUIRED", "邮箱不能为空"), error="EMAIL_REQUIRED")
                allowed_domain = (org_invite_link.allowed_email_domain or "").strip().lower()
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
            elif code.startswith("oi_"):
                org_email_inv = (
                    await OrganizationEmailInvite.filter(code=code).using_db(conn).select_for_update().first()
                )
                if org_email_inv is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                if org_email_inv.revoked_at is not None:
                    raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
                if org_email_inv.accepted_at is not None:
                    raise Conflict(
                        message=self._ta("INVITE_REVOKED", "邀请不可用"),
                        error="INVITE_ALREADY_ACCEPTED",
                    )
                if org_email_inv.expires_at is not None and org_email_inv.expires_at <= now:
                    raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

                organization_id = UUID(str(cast(HasOrganizationId, org_email_inv).organization_id))
                inviter_user_id = org_email_inv.created_by_user_id
                assigned_role_code = org_email_inv.role_code
                is_org_scope = True

                user_email = (user.email or "").strip().lower()
                invite_email = (org_email_inv.email or "").strip().lower()
                if not user_email or user_email != invite_email:
                    raise Forbidden(
                        message=self._ta("INVITE_EMAIL_MISMATCH", "邀请邮箱不匹配"),
                        error="INVITE_EMAIL_MISMATCH",
                    )
            else:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            if organization_id is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

            org = await self.organization_repo.get_by_id_in_connection(organization_id, conn=conn)
            if org is None or not org.is_active:
                raise Forbidden(message=self._ta("ORG_INACTIVE", "组织不可用"), error="ORG_INACTIVE")
            if not is_org_scope:
                if workspace_id is None:
                    raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
                ws = await self.workspace_repo.get_by_id_in_connection(workspace_id, conn=conn)
                if ws is None or not ws.is_active or ws.archived_at is not None:
                    raise Forbidden(
                        message=t("errors", "NOT_FOUND"),
                        error="WORKSPACE_INACTIVE",
                    )
                if UUID(str(cast(HasOrganizationId, ws).organization_id)) != organization_id:
                    raise Forbidden(
                        message=t("errors", "PERMISSION_DENIED"),
                        error="CROSS_ORG_ACCESS_DENIED",
                    )

            # One user can only be in one organization.
            existing_orgm = await OrgMembership.filter(user_id=user.id).using_db(conn).select_for_update().first()

            if is_org_scope and existing_orgm is not None:
                if UUID(str(cast(HasOrganizationId, existing_orgm).organization_id)) == organization_id:
                    raise Conflict(
                        message=self._ta("INVITE_ALREADY_MEMBER", "你已是该组织的成员"),
                        error="INVITE_ALREADY_MEMBER",
                    )

            join_as_guest = bool((not is_org_scope) and is_workspace_guest_invite_code(code))

            # Workspace invitations never imply organization governance elevation.
            normalized_org_role = self._to_builtin_org_role(assigned_role_code) if is_org_scope else OrgRole.MEMBER
            org_membership_role_code = (
                str(assigned_role_code or "").strip().lower()
                if is_org_scope and assigned_role_code
                else normalized_org_role.value
            )
            if existing_orgm is None:
                if not join_as_guest:
                    await OrgMembership.create(
                        using_db=conn,
                        organization_id=organization_id,
                        user_id=user.id,
                        role=normalized_org_role,
                        role_code=org_membership_role_code,
                        status="active",
                    )
            else:
                if UUID(str(cast(HasOrganizationId, existing_orgm).organization_id)) != organization_id:
                    raise Forbidden(
                        message=t("errors", "PERMISSION_DENIED"),
                        error="CROSS_ORG_ACCESS_DENIED",
                    )

            wsm: WorkspaceMembership | None = None
            roles: list[Role] = []
            if not is_org_scope:
                if workspace_id is None:
                    raise ServiceUnavailable(
                        message=t("errors", "SERVICE_UNAVAILABLE"),
                        error="SERVICE_UNAVAILABLE",
                    )

                existing_wsm = await WorkspaceMembership.get_or_none(
                    user_id=user.id, workspace_id=workspace_id, using_db=conn
                )
                if existing_wsm is not None and existing_wsm.status == WorkspaceMembershipStatus.ACTIVE:
                    raise Conflict(
                        message=self._ta("INVITE_ALREADY_MEMBER", "你已是该工作区的成员"),
                        error="INVITE_ALREADY_MEMBER",
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
                    role = await Role.get_or_none(workspace_id=workspace_id, code=assigned_role_code, using_db=conn)
                    if role is not None:
                        roles = [role]
                else:
                    roles = await Role.filter(workspace_id=workspace_id, is_default=True).using_db(conn).all()

                for role in roles:
                    await WorkspaceMembershipRole.get_or_create(using_db=conn, membership_id=wsm.id, role_id=role.id)

                await ensure_role_codes_have_admin_access(
                    workspace_id=workspace_id, role_codes=[r.code for r in roles], conn=conn
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
                    using_db=conn,
                    update_fields=["uses_count", "last_used_by_user_id", "last_used_at"],
                )
                await WorkspaceInviteLinkUseEvent.create(
                    using_db=conn,
                    link_id=invite_link.id,
                    used_by_user_id=user.id,
                    used_at=now,
                    joined_membership_id=wsm.id if wsm is not None else None,
                )

            if org_email_inv is not None:
                org_email_inv.accepted_by_user_id = user.id
                org_email_inv.accepted_at = now
                await org_email_inv.save(using_db=conn, update_fields=["accepted_by_user_id", "accepted_at"])

            if org_invite_link is not None:
                org_invite_link.uses_count = int(org_invite_link.uses_count or 0) + 1
                org_invite_link.last_used_by_user_id = user.id
                org_invite_link.last_used_at = now
                await org_invite_link.save(
                    using_db=conn,
                    update_fields=["uses_count", "last_used_by_user_id", "last_used_at"],
                )
                joined_orgm = await OrgMembership.filter(user_id=user.id).using_db(conn).first()
                await OrganizationInviteLinkUseEvent.create(
                    using_db=conn,
                    link_id=org_invite_link.id,
                    used_by_user_id=user.id,
                    used_at=now,
                    joined_membership_id=joined_orgm.id if joined_orgm is not None else None,
                )

            assigned_role_code = assigned_role_code or (roles[0].code if roles else normalized_org_role.value)

        if inviter_user_id is not None and organization_id is not None:
            try:
                from src.models.system.notification import NotificationCategory, NotificationRecord

                accepted_display_name = user.display_name or user.username
                is_org_invite = code.startswith("oi_") or code.startswith("ol_")
                if not is_org_invite and workspace_id is not None:
                    in_app_enabled = await is_notification_channel_enabled_for_event(
                        user_id=inviter_user_id,
                        event_name="workspace.invitation.accepted",
                        channel="in_app",
                    )
                    if in_app_enabled:
                        await NotificationRecord.create(
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
            except BaseException as exc:
                _raise_if_fatal(exc)
                self.logger.warning(
                    "Notification create failed (invite accepted existing)",
                    error=str(exc),
                    org_id=str(organization_id),
                    inviter_user_id=str(inviter_user_id),
                )

        if organization_id is None:
            raise ServiceUnavailable(
                message=t("errors", "SERVICE_UNAVAILABLE"),
                error="SERVICE_UNAVAILABLE",
            )

        project_id = None
        if workspace_id is not None:
            project = await self.project_repo.get_first_project_by_workspace_id(workspace_id=workspace_id)
            project_id = project.id if project is not None else None

        return AcceptExistingInvitationResult(
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            role_code=assigned_role_code,
        )
