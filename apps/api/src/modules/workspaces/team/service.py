from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.email.service import EmailService
from src.common.protocols.tortoise import HasUserId
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService
from src.models.organization.user import User
from src.models.system.notification import NotificationCategory
from src.models.system.rbac import SystemRole
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipRole, WorkspaceMembershipStatus
from src.modules.analytics.audit import (
    ActivityAuditPayload,
    activity_properties_from_payload,
    write_required_activity_event,
)
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.system.admin.notifications.catalog import create_notification_record
from src.modules.workspaces.authz.role_management import (
    WorkspaceRoleManagementAvailability,
    WorkspaceRoleManagementAvailabilityReader,
    build_workspace_role_management_availability_reader,
    require_workspace_role_management,
    require_workspace_role_management_decision,
)
from src.modules.workspaces.membership_lifecycle import (
    WorkspaceMembershipEndParticipant,
    build_workspace_membership_end_participant,
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

TEAM_MEMBERS_TARGET_TO = "/settings/team/members"
SYSTEM_ACTOR_LABEL = "System"


def _coerce_uuid(value: object | None) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _user_ref(user: User) -> WorkspaceTeamUserRefOut:
    return WorkspaceTeamUserRefOut(
        user_id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )


def _is_workspace_owner(membership: WorkspaceMembership) -> bool:
    return UUID(str(cast(HasUserId, membership).user_id)) == UUID(str(membership.workspace.owner_user_id))


class WorkspaceTeamService(WorkspaceTeamInviteMixin, BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        role_management_reader: WorkspaceRoleManagementAvailabilityReader,
        feature_access_release_participant: WorkspaceMembershipEndParticipant,
        connector_registry: ConnectorRegistry | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = WorkspaceTeamRepository()
        self.role_management_reader = role_management_reader
        self.feature_access_release_participant = feature_access_release_participant
        self.user_repo = UserRepository()
        self.email_service = EmailService(
            settings,
            connector_registry=connector_registry,
        )

    async def _write_activity_event(
        self,
        *,
        name: str,
        actor_user_id: UUID | None,
        payload: dict,
        conn: BaseDBAsyncClient | None = None,
        source: str = "api",
    ) -> None:
        """Persist required workspace team Activity evidence."""

        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=name,
                actor_user_id=actor_user_id,
                organization_id=_coerce_uuid(payload.get("organization_id") or payload.get("org_id")),
                workspace_id=_coerce_uuid(payload.get("workspace_id")),
                subject_user_id=_coerce_uuid(payload.get("subject_user_id")),
                entity_type=str(payload["entity_type"]) if payload.get("entity_type") is not None else None,
                entity_id=_coerce_uuid(payload.get("entity_id")),
                source=source,
                properties=activity_properties_from_payload(payload),
            ),
            conn=conn,
        )

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
        await create_notification_record(
            settings=self.settings,
            workspace_id=workspace_id,
            recipient_user_id=recipient_user_id,
            category=category,
            title=title,
            body=body,
            target_to=target_to,
            target_meta=None,
            event_name=event_name,
            dedupe_key=dedupe_key,
            actor_user_id=actor_user_id,
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

    def _build_member_out(
        self,
        *,
        membership: WorkspaceMembership,
        include_role_codes: bool = True,
    ) -> WorkspaceTeamMemberOut:
        membership_roles = getattr(membership, "membership_roles", None) or []
        role_codes = (
            sorted({
                mr.role.code
                for mr in membership_roles
                if getattr(mr, "role", None) and mr.ended_at is None and mr.role.ended_at is None
            })
            if include_role_codes
            else []
        )
        user = membership.user
        return WorkspaceTeamMemberOut(
            id=membership.id,
            membership_id=membership.id,
            membership_status=membership.status,
            is_owner=_is_workspace_owner(membership),
            user_id=user.id,
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            user_status=user.status,
            last_login_at=user.last_login_at,
            role_codes=role_codes,
        )

    async def _get_role_by_code_in_workspace(self, *, workspace_id: UUID, role_code: str) -> SystemRole | None:
        code = (role_code or "").strip()
        if not code:
            return None
        return await SystemRole.get_or_none(workspace_id=workspace_id, code=code, ended_at=None)

    async def _require_role_management(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        await require_workspace_role_management(
            workspace_id=workspace_id,
            reader=self.role_management_reader,
            conn=conn,
        )

    async def _get_role_management_availability(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceRoleManagementAvailability:
        return await require_workspace_role_management_decision(
            workspace_id=workspace_id,
            reader=self.role_management_reader,
            conn=conn,
        )

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
        availability = await require_workspace_role_management_decision(
            workspace_id=workspace_id,
            reader=self.role_management_reader,
        )
        qs = self.repo.query_memberships(workspace_id=workspace_id, filters=filters)
        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).prefetch_related("membership_roles__role").all()

        items: list[WorkspaceTeamMemberOut] = []
        for membership in rows:
            items.append(self._build_member_out(membership=membership, include_role_codes=availability.included))

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

        async with self.tx() as conn:
            membership = await self.repo.get_membership(
                membership_id=membership_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if membership is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
            if membership.status != WorkspaceMembershipStatus.ACTIVE:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="MEMBERSHIP_NOT_ACTIVE")

            user = membership.user
            updates: dict = {}
            if payload.email is not None:
                email = str(payload.email).strip().lower() if payload.email else None
                if (
                    email
                    and email != (user.email or "").strip().lower()
                    and await self.user_repo.exists_email_in_connection(email, conn=conn)
                ):
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
                    await user.save(update_fields=list(updates.keys()), using_db=conn)
                except IntegrityError as exc:
                    # Defensive: email has a unique constraint. Race conditions can still happen.
                    raise Conflict(message=t("errors", "CONFLICT"), error="CONFLICT") from exc

                await self._write_activity_event(
                    name="workspace.member.profile.updated",
                    actor_user_id=acting_user_id,
                    conn=conn,
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

            membership = await self.repo.get_membership_with_roles(
                membership_id=membership.id,
                conn=conn,
            )
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
        subject_user_id: UUID | None = None
        async with self.tx() as conn:
            membership = await self.repo.get_membership(
                membership_id=membership_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if membership is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

            if _is_workspace_owner(membership):
                raise BadRequest(
                    message=t("errors", "WORKSPACE_OWNER_MEMBERSHIP_IMMUTABLE"),
                    error="WORKSPACE_OWNER_MEMBERSHIP_IMMUTABLE",
                )

            membership_user_id = UUID(str(cast(HasUserId, membership).user_id))
            if membership_user_id == acting_user_id and not enabled:
                raise BadRequest(
                    message=t("errors", "CANNOT_DISABLE_SELF"),
                    error="CANNOT_DISABLE_SELF",
                )

            target = WorkspaceMembershipStatus.ACTIVE if enabled else WorkspaceMembershipStatus.DISABLED
            status_changed = membership.status != target
            if status_changed:
                if target == WorkspaceMembershipStatus.DISABLED:
                    await self.feature_access_release_participant.release_for_membership_end(
                        workspace_id=workspace_id,
                        membership_id=membership.id,
                        lifecycle_idempotency_key=(
                            f"workspace-membership:{membership.id}:disable:{membership.updated_at.isoformat()}"
                        ),
                        conn=conn,
                    )
                membership.status = target
                await membership.save(update_fields=["status", "updated_at"], using_db=conn)

            try:
                subject_user_id = UUID(str(cast(HasUserId, membership).user_id))
            except (TypeError, ValueError):
                subject_user_id = None
            await self._write_activity_event(
                name="workspace.member.status.updated",
                actor_user_id=acting_user_id,
                conn=conn,
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

        membership_user_id: UUID | None = None
        async with self.tx() as conn:
            membership = await self.repo.get_membership(
                membership_id=membership_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if membership is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

            membership_user_id = UUID(str(cast(HasUserId, membership).user_id))
            user = await self.user_repo.get_by_id_with_credential_in_connection(membership_user_id, conn=conn)
            if user is None:
                raise NotFound(message=t("auth", "USER_NOT_FOUND"), error="NOT_FOUND")

            password_hash = hash_password(payload.new_password, self.settings.auth)
            await self.user_repo.set_password_in_connection(user, password_hash=password_hash, conn=conn)
            await self.user_repo.increment_token_version_in_connection(user, conn=conn)
            await self._write_activity_event(
                name="workspace.member.password.reset",
                actor_user_id=acting_user_id,
                conn=conn,
                payload={
                    "organization_id": str(organization_id),
                    "workspace_id": str(workspace_id),
                    "membership_id": str(membership.id),
                    "subject_user_id": str(membership_user_id),
                    "entity_type": "workspace_membership",
                    "entity_id": str(membership.id),
                },
            )
        assert membership_user_id is not None
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
        await self._require_role_management(workspace_id=workspace_id)
        subject_user_id: UUID | None = None
        before_codes: list[str] = []
        role_codes_after: list[str] = []
        async with self.tx() as conn:
            membership = await self.repo.get_membership(
                membership_id=membership_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if membership is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

            if _is_workspace_owner(membership):
                raise BadRequest(
                    message=t("errors", "WORKSPACE_OWNER_MEMBERSHIP_IMMUTABLE"),
                    error="WORKSPACE_OWNER_MEMBERSHIP_IMMUTABLE",
                )

            if membership.status != WorkspaceMembershipStatus.ACTIVE:
                raise BadRequest(
                    message=t("errors", "MEMBERSHIP_NOT_ACTIVE"),
                    error="MEMBERSHIP_NOT_ACTIVE",
                )

            role_codes = [c.strip() for c in (payload.role_codes or []) if c and c.strip()]
            roles = await self.repo.get_roles_by_codes(
                workspace_id=workspace_id,
                role_codes=role_codes,
                conn=conn,
            )
            found = {r.code for r in roles}
            missing = [c for c in role_codes if c not in found]
            if missing:
                raise BadRequest(
                    message=t("errors", "ROLE_NOT_FOUND"),
                    error="ROLE_NOT_FOUND",
                    meta={"missing": missing},
                )

            rows = (
                await WorkspaceMembershipRole
                .filter(membership_id=membership.id, ended_at=None, role__ended_at=None)
                .using_db(conn)
                .prefetch_related("role")
                .all()
            )
            before_codes = sorted({r.role.code for r in rows if getattr(r, "role", None)})

            await self.repo.replace_membership_roles(
                membership_id=membership.id,
                role_ids=[r.id for r in roles],
                conn=conn,
            )

            role_codes_after = sorted({r.code for r in roles})
            try:
                subject_user_id = UUID(str(cast(HasUserId, membership).user_id))
            except (TypeError, ValueError):
                subject_user_id = None
            await self._write_activity_event(
                name="workspace.member.roles.updated",
                actor_user_id=acting_user_id,
                conn=conn,
                payload={
                    "organization_id": str(organization_id),
                    "workspace_id": str(workspace_id),
                    "membership_id": str(membership.id),
                    "subject_user_id": str(subject_user_id) if subject_user_id else None,
                    "entity_type": "workspace_membership",
                    "entity_id": str(membership.id),
                    "role_codes_before": before_codes,
                    "role_codes_after": role_codes_after,
                },
            )
        if subject_user_id is not None and before_codes != role_codes_after:
            await self._notify_member_roles_updated(
                workspace_id=workspace_id,
                membership_id=membership.id,
                subject_user_id=subject_user_id,
                actor_user_id=acting_user_id,
                role_codes_after=role_codes_after,
            )


def build_workspace_team_service(
    settings: Settings,
    *,
    connector_registry: ConnectorRegistry | None = None,
) -> WorkspaceTeamService:
    return WorkspaceTeamService(
        settings,
        role_management_reader=build_workspace_role_management_availability_reader(),
        feature_access_release_participant=build_workspace_membership_end_participant(settings),
        connector_registry=connector_registry,
    )
