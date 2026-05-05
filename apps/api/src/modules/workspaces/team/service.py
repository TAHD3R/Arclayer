from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.exceptions import IntegrityError

from src.common.email.service import EmailService
from src.common.protocols.tortoise import HasUserId
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService
from src.models.organization.user import User
from src.models.system.notification import NotificationCategory, NotificationRecord
from src.models.system.rbac import Role
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipRole, WorkspaceMembershipStatus
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.system.admin.notifications.preferences import (
    is_notification_channel_enabled_for_event,
)
from src.modules.workspaces.team.invites.service import WorkspaceTeamInviteMixin
from src.modules.workspaces.team.repository import WorkspaceTeamRepository
from src.modules.workspaces.team.schema import (
    InviteStatus,
    WorkspaceInviteLinkParticipantOut,
    WorkspaceTeamMemberOut,
    WorkspaceTeamMemberRoleSetRequest,
    WorkspaceTeamMemberStatusResult,
    WorkspaceTeamResetPasswordRequest,
    WorkspaceTeamUserOptionOut,
    WorkspaceTeamUserRefOut,
    WorkspaceTeamUserUpdateRequest,
)

_FATAL_TEAM_ACTIVITY_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)
TEAM_MEMBERS_TARGET_TO = "/settings/team/members"
SYSTEM_ACTOR_LABEL = "System"


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_TEAM_ACTIVITY_ERRORS):
        raise exc


def _user_ref(user: User) -> WorkspaceTeamUserRefOut:
    return WorkspaceTeamUserRefOut(
        user_id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )


class WorkspaceTeamService(WorkspaceTeamInviteMixin, BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = WorkspaceTeamRepository()
        self.user_repo = UserRepository()
        self.email_service = EmailService(settings)

    async def _publish_activity_event(
        self,
        *,
        name: str,
        actor_user_id: UUID | None,
        payload: dict,
        source: str = "api",
    ) -> None:
        """
        Best-effort publish of in-process events for Activity ingestion.

        Notes:
        - Must never break the main request flow.
        - Keep payload minimal; ingestion layer will sanitize again.
        """

        try:
            await self.publish_optional_domain_event(
                name=name,
                payload=payload,
                actor_user_id=actor_user_id,
                source=source,
            )
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Workspace team activity event publish failed",
                action="publish_workspace_team_activity",
                event_name=name,
                actor_user_id=str(actor_user_id) if actor_user_id else None,
                error=str(exc),
            )
            # Best-effort only.
            return

    async def _resolve_actor_label(self, *, actor_user_id: UUID | None) -> str:
        if actor_user_id is None:
            return SYSTEM_ACTOR_LABEL
        user = await self.user_repo.get_by_id(actor_user_id)
        if user is None:
            return SYSTEM_ACTOR_LABEL
        label = (user.display_name or user.username or user.email or "").strip()
        return label or SYSTEM_ACTOR_LABEL

    async def _create_notification_record(
        self,
        *,
        workspace_id: UUID,
        recipient_user_id: UUID,
        actor_user_id: UUID | None,
        category: NotificationCategory,
        title: str,
        body: str | None,
        target_to: str,
        event_name: str,
        dedupe_key: str | None,
    ) -> None:
        in_app_enabled = await is_notification_channel_enabled_for_event(
            user_id=recipient_user_id,
            event_name=event_name,
            channel="in_app",
        )
        if not in_app_enabled:
            return

        try:
            await NotificationRecord.create(
                workspace_id=workspace_id,
                recipient_user_id=recipient_user_id,
                actor_user_id=actor_user_id,
                category=category,
                title=title,
                body=body,
                target_to=target_to,
                target_meta=None,
                event_name=event_name,
                dedupe_key=dedupe_key,
            )
        except IntegrityError:
            return
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Workspace team notification create failed",
                action="create_workspace_team_notification",
                workspace_id=str(workspace_id),
                recipient_user_id=str(recipient_user_id),
                event_name=event_name,
                error=str(exc),
            )

    async def _notify_workspace_email_invite_change(
        self,
        *,
        workspace_id: UUID,
        invited_email: str,
        invited_by_user_id: UUID,
        invite_id: UUID,
        role_code: str | None,
        action: str,
    ) -> None:
        normalized_email = invited_email.strip().lower()
        if not normalized_email:
            return
        recipient = await self.user_repo.get_by_email(normalized_email)
        if recipient is None:
            return

        actor_label = await self._resolve_actor_label(actor_user_id=invited_by_user_id)
        role_label = (role_code or "member").strip() or "member"
        title_key = f"NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_{action.upper()}_TITLE"
        body_key = f"NOTIFICATIONS_WORKSPACE_EMAIL_INVITE_{action.upper()}_BODY"
        title = t(
            "notifications",
            title_key,
            default="{actor} invited you to join the workspace",
            actor=actor_label,
        )
        body = t("notifications", body_key, role=role_label)
        await self._create_notification_record(
            workspace_id=workspace_id,
            recipient_user_id=recipient.id,
            actor_user_id=invited_by_user_id,
            category=NotificationCategory.TEAM,
            title=title,
            body=body,
            target_to=TEAM_MEMBERS_TARGET_TO,
            event_name=f"workspace.invite.email.{action}",
            dedupe_key=f"workspace.invite.email.{action}:{invite_id}",
        )

    async def _notify_member_status_updated(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        subject_user_id: UUID,
        actor_user_id: UUID,
        enabled: bool,
    ) -> None:
        actor_label = await self._resolve_actor_label(actor_user_id=actor_user_id)
        status_key = "ENABLED" if enabled else "DISABLED"
        title = t(
            "notifications",
            f"NOTIFICATIONS_MEMBER_STATUS_{status_key}_TITLE",
            default="Your workspace membership was updated",
            actor=actor_label,
        )
        body = t(
            "notifications",
            f"NOTIFICATIONS_MEMBER_STATUS_{status_key}_BODY",
            default="{actor} changed your workspace membership status.",
            actor=actor_label,
        )
        await self._create_notification_record(
            workspace_id=workspace_id,
            recipient_user_id=subject_user_id,
            actor_user_id=actor_user_id,
            category=NotificationCategory.SECURITY,
            title=title,
            body=body,
            target_to=TEAM_MEMBERS_TARGET_TO,
            event_name="workspace.member.status.updated",
            dedupe_key=None,
        )

    async def _notify_member_roles_updated(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        subject_user_id: UUID,
        actor_user_id: UUID,
        role_codes_after: list[str],
    ) -> None:
        actor_label = await self._resolve_actor_label(actor_user_id=actor_user_id)
        role_text = ", ".join(role_codes_after) if role_codes_after else "-"
        title = t(
            "notifications",
            "NOTIFICATIONS_MEMBER_ROLES_UPDATED_TITLE",
            default="Your workspace roles were updated",
            actor=actor_label,
        )
        body = t(
            "notifications",
            "NOTIFICATIONS_MEMBER_ROLES_UPDATED_BODY",
            default="{actor} updated your roles to: {roles}",
            actor=actor_label,
            roles=role_text,
        )
        await self._create_notification_record(
            workspace_id=workspace_id,
            recipient_user_id=subject_user_id,
            actor_user_id=actor_user_id,
            category=NotificationCategory.TEAM,
            title=title,
            body=body,
            target_to=TEAM_MEMBERS_TARGET_TO,
            event_name="workspace.member.roles.updated",
            dedupe_key=None,
        )

    async def _notify_member_password_reset(
        self,
        *,
        workspace_id: UUID,
        subject_user_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        actor_label = await self._resolve_actor_label(actor_user_id=actor_user_id)
        title = t(
            "notifications",
            "NOTIFICATIONS_MEMBER_PASSWORD_RESET_TITLE",
            default="Your workspace password was reset",
            actor=actor_label,
        )
        body = t(
            "notifications",
            "NOTIFICATIONS_MEMBER_PASSWORD_RESET_BODY",
            default="{actor} reset your password from team management.",
            actor=actor_label,
        )
        await self._create_notification_record(
            workspace_id=workspace_id,
            recipient_user_id=subject_user_id,
            actor_user_id=actor_user_id,
            category=NotificationCategory.SECURITY,
            title=title,
            body=body,
            target_to=TEAM_MEMBERS_TARGET_TO,
            event_name="workspace.member.password.reset",
            dedupe_key=None,
        )

    def _build_member_out(self, *, membership: WorkspaceMembership) -> WorkspaceTeamMemberOut:
        membership_roles = getattr(membership, "membership_roles", None) or []
        role_codes = sorted({mr.role.code for mr in membership_roles if getattr(mr, "role", None)})
        user = membership.user
        return WorkspaceTeamMemberOut(
            id=membership.id,
            membership_id=membership.id,
            membership_status=membership.status,
            user_id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            user_status=user.status,
            last_login_at=user.last_login_at,
            role_codes=role_codes,
        )

    async def _get_role_by_code_in_workspace(self, *, workspace_id: UUID, role_code: str) -> Role | None:
        code = (role_code or "").strip()
        if not code:
            return None
        return await Role.get_or_none(workspace_id=workspace_id, code=code)

    async def _list_recent_participants(
        self, *, link_id: UUID, limit: int = 3
    ) -> list[WorkspaceInviteLinkParticipantOut]:
        events = await self.repo.list_recent_link_events(link_id=link_id, limit=limit)
        if not events:
            return []
        user_ids = [UUID(str(e.used_by_user_id)) for e in events if e.used_by_user_id]
        users = await self.repo.list_users_by_ids(user_ids=user_ids)
        user_by_id = {UUID(str(u.id)): u for u in users}
        out: list[WorkspaceInviteLinkParticipantOut] = []
        for e in events:
            u = user_by_id.get(UUID(str(e.used_by_user_id)))
            if u is None:
                continue
            out.append(WorkspaceInviteLinkParticipantOut(user=_user_ref(u), used_at=e.used_at))
        return out

    async def get_workspace_name(self, *, workspace_id: UUID) -> str:
        ws = await self.repo.get_workspace(workspace_id=workspace_id)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        return ws.name

    def _compute_invite_status(
        self, *, accepted_at: datetime | None, revoked_at: datetime | None, expires_at: datetime | None
    ) -> InviteStatus:
        if accepted_at is not None:
            return InviteStatus.ACCEPTED
        if revoked_at is not None:
            return InviteStatus.REVOKED
        if expires_at is not None and expires_at <= datetime.now(UTC):
            return InviteStatus.EXPIRED
        return InviteStatus.PENDING

    async def list_members(
        self,
        *,
        workspace_id: UUID,
        params: PageParams,
        filters,
    ) -> PageData[WorkspaceTeamMemberOut]:
        qs = self.repo.query_memberships(workspace_id=workspace_id, filters=filters)
        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).prefetch_related("membership_roles__role").all()

        items: list[WorkspaceTeamMemberOut] = []
        for membership in rows:
            items.append(self._build_member_out(membership=membership))

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[WorkspaceTeamMemberOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def list_user_options(
        self,
        *,
        workspace_id: UUID,
        params: PageParams,
        q: str | None,
    ) -> PageData[WorkspaceTeamUserOptionOut]:
        """
        List lightweight user options within a workspace, for Select components.

        Notes:
        - Scope boundary is strict: only users who have a membership record in the workspace.
        - We include both ACTIVE and DISABLED members so historical actors remain discoverable.
        """

        qs = await self.repo.query_user_options(workspace_id=workspace_id, q=q)

        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).all()

        items: list[WorkspaceTeamUserOptionOut] = []
        for m in rows:
            user = m.user
            label = (user.display_name or user.username or user.email or "").strip() or str(user.id)
            items.append(
                WorkspaceTeamUserOptionOut(
                    value=UUID(str(user.id)),
                    label=label,
                    avatar_url=user.avatar_url,
                )
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[WorkspaceTeamUserOptionOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def update_member_user(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        membership_id: UUID,
        payload: WorkspaceTeamUserUpdateRequest,
        acting_user_id: UUID,
    ) -> WorkspaceTeamMemberOut:
        """
        Update a member's user profile (global identity) but enforce workspace scope.

        Notes:
        - This is intentionally workspace-scoped to prevent cross-workspace manipulation.
        - We do not allow changing username here.
        """

        membership = await self.repo.get_membership(membership_id=membership_id, workspace_id=workspace_id)
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        if membership.status != WorkspaceMembershipStatus.ACTIVE:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="MEMBERSHIP_NOT_ACTIVE")

        user = membership.user
        updates: dict = {}
        if payload.email is not None:
            email = str(payload.email).strip().lower() if payload.email else None
            if email and email != (user.email or "").strip().lower() and await self.user_repo.exists_email(email):
                raise Conflict(message=t("auth", "EMAIL_EXISTS"), error="CONFLICT")
            updates["email"] = email
        if payload.display_name is not None:
            updates["display_name"] = payload.display_name
        if payload.avatar_url is not None:
            updates["avatar_url"] = payload.avatar_url

        if updates:
            for k, v in updates.items():
                setattr(user, k, v)
            try:
                await user.save(update_fields=list(updates.keys()))
            except IntegrityError as exc:
                # Defensive: email has a unique constraint. Race conditions can still happen.
                raise Conflict(message=t("errors", "CONFLICT"), error="CONFLICT") from exc

            await self._publish_activity_event(
                name="workspace.member.profile.updated",
                actor_user_id=acting_user_id,
                payload={
                    "organization_id": str(organization_id),
                    "workspace_id": str(workspace_id),
                    "membership_id": str(membership.id),
                    "subject_user_id": str(user.id),
                    "entity_type": "workspace_membership",
                    "entity_id": str(membership.id),
                    "changed_fields": sorted(updates.keys()),
                    "email_updated": "email" in updates,
                    "display_name_updated": "display_name" in updates,
                    "avatar_url_updated": "avatar_url" in updates,
                },
            )

        membership = await self.repo.get_membership_with_roles(membership_id=membership.id)
        assert membership is not None
        return self._build_member_out(membership=membership)

    async def set_member_status(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        membership_id: UUID,
        enabled: bool,
        acting_user_id: UUID,
    ) -> WorkspaceTeamMemberStatusResult:
        membership = await self.repo.get_membership(membership_id=membership_id, workspace_id=workspace_id)
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        membership_user_id = UUID(str(cast(HasUserId, membership).user_id))
        if membership_user_id == acting_user_id and not enabled:
            raise BadRequest(
                message=t("errors", "CANNOT_DISABLE_SELF"),
                error="CANNOT_DISABLE_SELF",
            )

        target = WorkspaceMembershipStatus.ACTIVE if enabled else WorkspaceMembershipStatus.DISABLED
        status_changed = membership.status != target
        if status_changed:
            membership.status = target
            await membership.save(update_fields=["status", "updated_at"])

        # Emit activity event (best-effort).
        try:
            subject_user_id = UUID(str(cast(HasUserId, membership).user_id))
        except (TypeError, ValueError):
            subject_user_id = None
        await self._publish_activity_event(
            name="workspace.member.status.updated",
            actor_user_id=acting_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "membership_id": str(membership.id),
                "subject_user_id": str(subject_user_id) if subject_user_id else None,
                "entity_type": "workspace_membership",
                "entity_id": str(membership.id),
                "enabled": bool(enabled),
            },
        )
        if status_changed and subject_user_id is not None:
            await self._notify_member_status_updated(
                workspace_id=workspace_id,
                membership_id=membership.id,
                subject_user_id=subject_user_id,
                actor_user_id=acting_user_id,
                enabled=enabled,
            )

        return WorkspaceTeamMemberStatusResult(membership_id=membership.id, status=membership.status)

    async def reset_member_password(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        membership_id: UUID,
        payload: WorkspaceTeamResetPasswordRequest,
        acting_user_id: UUID,
    ) -> None:
        """
        Reset the user's password for a workspace member.

        Note:
        - This affects the global user account, but remains workspace-scoped for authorization.
        """

        membership = await self.repo.get_membership(membership_id=membership_id, workspace_id=workspace_id)
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        membership_user_id = UUID(str(cast(HasUserId, membership).user_id))
        user = await self.user_repo.get_by_id_with_credential(membership_user_id)
        if user is None:
            raise NotFound(message=t("auth", "USER_NOT_FOUND"), error="NOT_FOUND")

        password_hash = hash_password(payload.new_password, self.settings.auth)
        await self.user_repo.set_password(user, password_hash)
        await self.user_repo.increment_token_version(user)
        await self._publish_activity_event(
            name="workspace.member.password.reset",
            actor_user_id=acting_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "membership_id": str(membership.id),
                "subject_user_id": str(membership_user_id),
                "entity_type": "workspace_membership",
                "entity_id": str(membership.id),
            },
        )
        await self._notify_member_password_reset(
            workspace_id=workspace_id,
            subject_user_id=membership_user_id,
            actor_user_id=acting_user_id,
        )

    async def set_member_roles(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        membership_id: UUID,
        payload: WorkspaceTeamMemberRoleSetRequest,
        acting_user_id: UUID,
    ) -> None:
        membership = await self.repo.get_membership(membership_id=membership_id, workspace_id=workspace_id)
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        if membership.status != WorkspaceMembershipStatus.ACTIVE:
            raise BadRequest(
                message=t("errors", "MEMBERSHIP_NOT_ACTIVE"),
                error="MEMBERSHIP_NOT_ACTIVE",
            )

        role_codes = [c.strip() for c in (payload.role_codes or []) if c and c.strip()]
        roles = await self.repo.get_roles_by_codes(workspace_id=workspace_id, role_codes=role_codes)
        found = {r.code for r in roles}
        missing = [c for c in role_codes if c not in found]
        if missing:
            raise BadRequest(
                message=t("errors", "ROLE_NOT_FOUND"),
                error="ROLE_NOT_FOUND",
                meta={"missing": missing},
            )

        # Capture current roles (best-effort; for Activity diff display).
        before_codes: list[str] = []
        try:
            rows = await WorkspaceMembershipRole.filter(membership_id=membership.id).prefetch_related("role").all()
            before_codes = sorted({r.role.code for r in rows if getattr(r, "role", None)})
        except BaseException as exc:
            _raise_if_fatal(exc)
            before_codes = []
            self.logger.warning(
                "Workspace member role snapshot failed",
                action="snapshot_member_roles",
                workspace_id=str(workspace_id),
                membership_id=str(membership.id),
                error=str(exc),
            )

        await self.repo.replace_membership_roles(membership_id=membership.id, role_ids=[r.id for r in roles])

        # Emit activity event (best-effort).
        try:
            subject_user_id = UUID(str(cast(HasUserId, membership).user_id))
        except (TypeError, ValueError):
            subject_user_id = None
        await self._publish_activity_event(
            name="workspace.member.roles.updated",
            actor_user_id=acting_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "membership_id": str(membership.id),
                "subject_user_id": str(subject_user_id) if subject_user_id else None,
                "entity_type": "workspace_membership",
                "entity_id": str(membership.id),
                "role_codes_before": before_codes,
                "role_codes_after": sorted({r.code for r in roles}),
            },
        )
        role_codes_after = sorted({r.code for r in roles})
        if subject_user_id is not None and before_codes != role_codes_after:
            await self._notify_member_roles_updated(
                workspace_id=workspace_id,
                membership_id=membership.id,
                subject_user_id=subject_user_id,
                actor_user_id=acting_user_id,
                role_codes_after=role_codes_after,
            )
