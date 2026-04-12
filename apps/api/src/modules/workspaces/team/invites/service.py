from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from src.common.invitations.expiry import build_expires_at
from src.common.invitations.tokens import build_invite_token, generate_invite_code
from src.common.invitations.workspace_invites import (
    WORKSPACE_EMAIL_INVITE_PREFIX_GUEST,
    WORKSPACE_EMAIL_INVITE_PREFIX_MEMBER,
    WORKSPACE_INVITE_LINK_PREFIX_GUEST,
    WORKSPACE_INVITE_LINK_PREFIX_MEMBER,
)
from src.common.protocols.tortoise import (
    WorkspaceEmailInviteMutableFields,
    WorkspaceInviteLinkMutableFields,
)
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.models.organization.user import User
from src.models.system.rbac import Role
from src.models.workspaces.workspace_invite import (
    WorkspaceEmailInvite,
    WorkspaceInviteLink,
    WorkspaceInviteLinkUseEvent,
)
from src.modules.workspaces.team.repository import WorkspaceTeamRepository
from src.modules.workspaces.team.schema import (
    InviteStatus,
    WorkspaceEmailInviteCreateRequest,
    WorkspaceEmailInviteCreateResult,
    WorkspaceEmailInviteOut,
    WorkspaceEmailInviteRenewRequest,
    WorkspaceInviteJoinMode,
    WorkspaceInviteLinkCreateRequest,
    WorkspaceInviteLinkCreateResult,
    WorkspaceInviteLinkOut,
    WorkspaceInviteLinkParticipantOut,
    WorkspaceInviteLinkRenewRequest,
    WorkspaceTeamUserRefOut,
)


def _user_ref(user: User) -> WorkspaceTeamUserRefOut:
    return WorkspaceTeamUserRefOut(
        user_id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )


def _resolve_workspace_email_invite_prefix(join_mode: WorkspaceInviteJoinMode) -> str:
    if join_mode == WorkspaceInviteJoinMode.GUEST:
        return WORKSPACE_EMAIL_INVITE_PREFIX_GUEST
    return WORKSPACE_EMAIL_INVITE_PREFIX_MEMBER


def _resolve_workspace_invite_link_prefix(join_mode: WorkspaceInviteJoinMode) -> str:
    if join_mode == WorkspaceInviteJoinMode.GUEST:
        return WORKSPACE_INVITE_LINK_PREFIX_GUEST
    return WORKSPACE_INVITE_LINK_PREFIX_MEMBER


_WORKSPACE_EMAIL_INVITE_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset({
    "created_at",
    "updated_at",
    "email",
    "role_code",
    "expires_at",
    "accepted_at",
    "revoked_at",
})

_WORKSPACE_INVITE_LINK_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset({
    "created_at",
    "updated_at",
    "display_code",
    "role_code",
    "allowed_email_domain",
    "expires_at",
    "disabled_at",
    "last_used_at",
    "uses_count",
})


def _normalize_workspace_email_invite_ordering(value: str | None) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _WORKSPACE_EMAIL_INVITE_ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["-created_at"]


def _normalize_workspace_invite_link_ordering(value: str | None) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _WORKSPACE_INVITE_LINK_ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["-created_at"]


class WorkspaceTeamInviteMixin:
    repo: WorkspaceTeamRepository
    settings: Settings
    logger: Any

    async def _publish_activity_event(
        self,
        *,
        name: str,
        actor_user_id: UUID | None,
        payload: dict,
        source: str = "api",
    ) -> None: ...

    def _compute_invite_status(
        self,
        *,
        accepted_at: datetime | None,
        revoked_at: datetime | None,
        expires_at: datetime | None,
    ) -> InviteStatus: ...

    async def _get_role_by_code_in_workspace(self, *, workspace_id: UUID, role_code: str) -> Role | None: ...

    async def _list_recent_participants(
        self, *, link_id: UUID, limit: int = 3
    ) -> list[WorkspaceInviteLinkParticipantOut]: ...

    async def _notify_workspace_email_invite_change(
        self,
        *,
        workspace_id: UUID,
        invited_email: str,
        invited_by_user_id: UUID,
        invite_id: UUID,
        role_code: str | None,
        action: str,
    ) -> None: ...

    async def create_or_update_email_invite(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        invited_by_user_id: UUID,
        payload: WorkspaceEmailInviteCreateRequest,
    ) -> WorkspaceEmailInviteCreateResult:
        email = str(payload.email).strip().lower()
        role_code = payload.role_code.strip() if payload.role_code else None
        expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)

        if role_code:
            role = await self._get_role_by_code_in_workspace(workspace_id=workspace_id, role_code=role_code)
            if role is None:
                raise BadRequest(
                    message=t("errors", "ROLE_NOT_FOUND", default="角色不存在"),
                    error="ROLE_NOT_FOUND",
                    meta={"missing": [role_code]},
                )

        is_update = False
        async with in_transaction() as conn:
            # Q2: only one active invite per (workspace, email). We enforce this by locking the existing row (if any).
            existing = (
                await WorkspaceEmailInvite
                .filter(
                    workspace_id=workspace_id,
                    email=email,
                    accepted_at=None,
                    revoked_at=None,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if existing is None:
                code = generate_invite_code(prefix=_resolve_workspace_email_invite_prefix(payload.join_mode))
                inv = await WorkspaceEmailInvite.create(
                    using_db=conn,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    email=email,
                    role_code=role_code,
                    code=code,
                    expires_at=expires_at,
                    created_by_user_id=invited_by_user_id,
                )
            else:
                is_update = True
                existing_like = cast(WorkspaceEmailInviteMutableFields, existing)
                existing_like.role_code = role_code
                existing_like.expires_at = expires_at
                await existing.save(using_db=conn, update_fields=["role_code", "expires_at", "updated_at"])
                inv = existing

        token = build_invite_token(self.settings, code=inv.code)
        base = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
        invite_url = f"{base}/invitations?token={token}" if base else None

        inviter_user = await User.get_or_none(id=inv.created_by_user_id)
        accepted_by = await User.get_or_none(id=inv.accepted_by_user_id) if inv.accepted_by_user_id else None
        out = WorkspaceEmailInviteOut(
            id=inv.id,
            email=inv.email,
            role_code=inv.role_code,
            expires_at=inv.expires_at,
            created_by_user_id=inv.created_by_user_id,
            created_by=_user_ref(inviter_user) if inviter_user else None,
            accepted_by_user_id=inv.accepted_by_user_id,
            accepted_by=_user_ref(accepted_by) if accepted_by else None,
            accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
            status=self._compute_invite_status(
                accepted_at=inv.accepted_at, revoked_at=inv.revoked_at, expires_at=inv.expires_at
            ),
            created_at=inv.created_at,
            updated_at=inv.updated_at,
        )

        def _mask_email(value: str) -> str:
            trimmed = (value or "").strip().lower()
            if "@" not in trimmed:
                return trimmed[:2] + "***" if trimmed else ""
            local, domain = trimmed.split("@", 1)
            safe_local = (local[:2] + "***") if local else "***"
            safe_domain = domain if domain else "***"
            return f"{safe_local}@{safe_domain}"

        await self._publish_activity_event(
            name="workspace.invite.email.created" if not is_update else "workspace.invite.email.updated",
            actor_user_id=invited_by_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "invite_id": str(inv.id),
                "email_hint": _mask_email(inv.email),
                "role_code": inv.role_code,
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
            },
        )
        await self._notify_workspace_email_invite_change(
            workspace_id=workspace_id,
            invited_email=inv.email,
            invited_by_user_id=invited_by_user_id,
            invite_id=inv.id,
            role_code=inv.role_code,
            action="updated" if is_update else "created",
        )
        return WorkspaceEmailInviteCreateResult(invitation=out, token=token, invite_url=invite_url)

    async def renew_email_invite(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        invite_id: UUID,
        payload: WorkspaceEmailInviteRenewRequest,
        renewed_by_user_id: UUID,
    ) -> WorkspaceEmailInviteCreateResult:
        expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)

        inv = await WorkspaceEmailInvite.get_or_none(
            id=invite_id, organization_id=organization_id, workspace_id=workspace_id
        )
        if inv is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        if inv.accepted_at is not None:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="邀请已被接受"), error="INVITE_ALREADY_ACCEPTED"
            )
        if inv.revoked_at is not None:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="邀请已被撤销"), error="INVITE_REVOKED")

        # Q1: only extend expires_at (do not rotate code).
        cast(WorkspaceEmailInviteMutableFields, inv).expires_at = expires_at
        await inv.save(update_fields=["expires_at", "updated_at"])

        token = build_invite_token(self.settings, code=inv.code)
        base = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
        invite_url = f"{base}/invitations?token={token}" if base else None

        inviter_user = await User.get_or_none(id=inv.created_by_user_id)
        out = WorkspaceEmailInviteOut(
            id=inv.id,
            email=inv.email,
            role_code=inv.role_code,
            expires_at=inv.expires_at,
            created_by_user_id=inv.created_by_user_id,
            created_by=_user_ref(inviter_user) if inviter_user else None,
            accepted_by_user_id=inv.accepted_by_user_id,
            accepted_by=None,
            accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
            status=self._compute_invite_status(
                accepted_at=inv.accepted_at, revoked_at=inv.revoked_at, expires_at=inv.expires_at
            ),
            created_at=inv.created_at,
            updated_at=inv.updated_at,
        )
        await self._publish_activity_event(
            name="workspace.invite.email.renewed",
            actor_user_id=renewed_by_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "invite_id": str(inv.id),
                "role_code": inv.role_code,
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
            },
        )
        await self._notify_workspace_email_invite_change(
            workspace_id=workspace_id,
            invited_email=inv.email,
            invited_by_user_id=renewed_by_user_id,
            invite_id=inv.id,
            role_code=inv.role_code,
            action="renewed",
        )
        return WorkspaceEmailInviteCreateResult(invitation=out, token=token, invite_url=invite_url)

    async def revoke_email_invite(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        invite_id: UUID,
        revoked_by_user_id: UUID,
    ) -> None:
        inv = await WorkspaceEmailInvite.get_or_none(
            id=invite_id, organization_id=organization_id, workspace_id=workspace_id
        )
        if inv is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        if inv.accepted_at is not None:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="邀请已被接受"), error="INVITE_ALREADY_ACCEPTED"
            )
        if inv.revoked_at is not None:
            return
        inv.revoked_at = datetime.now(UTC)
        inv.revoked_by_user_id = revoked_by_user_id
        await inv.save(update_fields=["revoked_at", "revoked_by_user_id", "updated_at"])

        await self._publish_activity_event(
            name="workspace.invite.email.revoked",
            actor_user_id=revoked_by_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "invite_id": str(inv.id),
                "role_code": inv.role_code,
            },
        )
        await self._notify_workspace_email_invite_change(
            workspace_id=workspace_id,
            invited_email=inv.email,
            invited_by_user_id=revoked_by_user_id,
            invite_id=inv.id,
            role_code=inv.role_code,
            action="revoked",
        )

    async def create_invite_link(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        created_by_user_id: UUID,
        payload: WorkspaceInviteLinkCreateRequest,
    ) -> WorkspaceInviteLinkCreateResult:
        role_code = payload.role_code.strip() if payload.role_code else None
        expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)
        max_uses = payload.max_uses

        allowed_domain = (payload.allowed_email_domain or "").strip().lower() or None
        if allowed_domain:
            # Normalize possible leading "@"
            allowed_domain = allowed_domain[1:] if allowed_domain.startswith("@") else allowed_domain

        if role_code:
            role = await self._get_role_by_code_in_workspace(workspace_id=workspace_id, role_code=role_code)
            if role is None:
                raise BadRequest(
                    message=t("errors", "ROLE_NOT_FOUND", default="角色不存在"),
                    error="ROLE_NOT_FOUND",
                    meta={"missing": [role_code]},
                )

        # display_code is short and only for UI search/display; avoid collisions.
        for _ in range(5):
            display_code = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
            if not display_code:
                continue
            if not await WorkspaceInviteLink.filter(display_code=display_code).exists():
                break
        else:
            raise BadRequest(
                message=t("errors", "FAILED_TO_CREATE_INVITE_LINK", default="创建邀请链接失败"),
                error="FAILED_TO_CREATE_INVITE_LINK",
            )

        code = generate_invite_code(prefix=_resolve_workspace_invite_link_prefix(payload.join_mode))
        link = await WorkspaceInviteLink.create(
            organization_id=organization_id,
            workspace_id=workspace_id,
            role_code=role_code,
            code=code,
            display_code=display_code,
            expires_at=expires_at,
            disabled_at=None,
            max_uses=max_uses,
            allowed_email_domain=allowed_domain,
            created_by_user_id=created_by_user_id,
        )

        token = build_invite_token(self.settings, code=link.code)
        base = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
        invite_url = f"{base}/invitations?token={token}" if base else None

        creator = await User.get_or_none(id=link.created_by_user_id) if link.created_by_user_id else None
        out = WorkspaceInviteLinkOut(
            id=link.id,
            display_code=link.display_code,
            role_code=link.role_code,
            expires_at=link.expires_at,
            disabled_at=link.disabled_at,
            max_uses=link.max_uses,
            allowed_email_domain=link.allowed_email_domain,
            token=token,
            invite_url=invite_url,
            created_by=_user_ref(creator) if creator else None,
            last_used_by=None,
            last_used_at=link.last_used_at,
            uses_count=int(link.uses_count or 0),
            recent_participants=[],
            created_at=link.created_at,
            updated_at=link.updated_at,
        )

        await self._publish_activity_event(
            name="workspace.invite.link.created",
            actor_user_id=created_by_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "link_id": str(link.id),
                "display_code": link.display_code,
                "role_code": link.role_code,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
                "max_uses": int(link.max_uses) if link.max_uses is not None else None,
                "allowed_email_domain": link.allowed_email_domain,
            },
        )
        return WorkspaceInviteLinkCreateResult(link=out, token=token, invite_url=invite_url)

    async def renew_invite_link(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        link_id: UUID,
        payload: WorkspaceInviteLinkRenewRequest,
        renewed_by_user_id: UUID,
    ) -> WorkspaceInviteLinkCreateResult:
        expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)
        link = await WorkspaceInviteLink.get_or_none(
            id=link_id, organization_id=organization_id, workspace_id=workspace_id
        )
        if link is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        cast(WorkspaceInviteLinkMutableFields, link).expires_at = expires_at
        await link.save(update_fields=["expires_at", "updated_at"])

        token = build_invite_token(self.settings, code=link.code)
        base = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
        invite_url = f"{base}/invitations?token={token}" if base else None

        creator = await User.get_or_none(id=link.created_by_user_id) if link.created_by_user_id else None
        last_used = await User.get_or_none(id=link.last_used_by_user_id) if link.last_used_by_user_id else None
        out = WorkspaceInviteLinkOut(
            id=link.id,
            display_code=link.display_code,
            role_code=link.role_code,
            expires_at=link.expires_at,
            disabled_at=link.disabled_at,
            max_uses=link.max_uses,
            allowed_email_domain=link.allowed_email_domain,
            token=token,
            invite_url=invite_url,
            created_by=_user_ref(creator) if creator else None,
            last_used_by=_user_ref(last_used) if last_used else None,
            last_used_at=link.last_used_at,
            uses_count=int(link.uses_count or 0),
            recent_participants=await self._list_recent_participants(link_id=link.id),
            created_at=link.created_at,
            updated_at=link.updated_at,
        )

        await self._publish_activity_event(
            name="workspace.invite.link.renewed",
            actor_user_id=renewed_by_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "link_id": str(link.id),
                "display_code": link.display_code,
                "role_code": link.role_code,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            },
        )
        return WorkspaceInviteLinkCreateResult(link=out, token=token, invite_url=invite_url)

    async def disable_invite_link(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        link_id: UUID,
        disabled_by_user_id: UUID,
    ) -> None:
        link = await WorkspaceInviteLink.get_or_none(
            id=link_id, organization_id=organization_id, workspace_id=workspace_id
        )
        if link is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        if link.disabled_at is not None:
            return
        link.disabled_at = datetime.now(UTC)
        await link.save(update_fields=["disabled_at", "updated_at"])

        await self._publish_activity_event(
            name="workspace.invite.link.disabled",
            actor_user_id=disabled_by_user_id,
            payload={
                "organization_id": str(organization_id),
                "workspace_id": str(workspace_id),
                "link_id": str(link.id),
                "display_code": link.display_code,
                "role_code": link.role_code,
            },
        )

    async def list_invite_links(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        mine: bool | None,
        current_user_id: UUID,
    ) -> PageData[WorkspaceInviteLinkOut]:
        qs = WorkspaceInviteLink.filter(organization_id=organization_id, workspace_id=workspace_id)
        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(Q(display_code__icontains=needle) | Q(role_code__icontains=needle))
        if mine:
            qs = qs.filter(created_by_user_id=current_user_id)

        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = (
            await qs
            .order_by(*_normalize_workspace_invite_link_ordering(ordering))
            .limit(params.limit)
            .offset(params.offset)
            .all()
        )

        user_ids: set[UUID] = set()
        for r in rows:
            if r.created_by_user_id:
                user_ids.add(UUID(str(r.created_by_user_id)))
            if r.last_used_by_user_id:
                user_ids.add(UUID(str(r.last_used_by_user_id)))
        users = await User.filter(id__in=list(user_ids)).all() if user_ids else []
        user_by_id = {UUID(str(u.id)): u for u in users}

        items: list[WorkspaceInviteLinkOut] = []
        for link in rows:
            creator = user_by_id.get(UUID(str(link.created_by_user_id))) if link.created_by_user_id else None
            last_used = user_by_id.get(UUID(str(link.last_used_by_user_id))) if link.last_used_by_user_id else None
            token = build_invite_token(self.settings, code=link.code)
            base = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
            invite_url = f"{base}/invitations?token={token}" if base else None
            items.append(
                WorkspaceInviteLinkOut(
                    id=link.id,
                    display_code=link.display_code,
                    role_code=link.role_code,
                    expires_at=link.expires_at,
                    disabled_at=link.disabled_at,
                    max_uses=link.max_uses,
                    allowed_email_domain=link.allowed_email_domain,
                    token=token,
                    invite_url=invite_url,
                    created_by=_user_ref(creator) if creator else None,
                    last_used_by=_user_ref(last_used) if last_used else None,
                    last_used_at=link.last_used_at,
                    uses_count=int(link.uses_count or 0),
                    recent_participants=await self._list_recent_participants(link_id=link.id),
                    created_at=link.created_at,
                    updated_at=link.updated_at,
                )
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[WorkspaceInviteLinkOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def list_invite_link_participants(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        link_id: UUID,
        params: PageParams,
        q: str | None,
    ) -> PageData[WorkspaceInviteLinkParticipantOut]:
        """
        List invite link participants (usage events) with pagination.

        Notes:
        - We paginate events (each event corresponds to one successful join via the invite link).
        - `used_by_user_id` is stored as UUID field (not FK), so we resolve users in a second query.
        - Optional `q` supports searching participant by username/email/display_name.
        """

        link = await WorkspaceInviteLink.get_or_none(
            id=link_id, organization_id=organization_id, workspace_id=workspace_id
        )
        if link is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        qs = WorkspaceInviteLinkUseEvent.filter(link_id=link.id)

        if q:
            needle = q.strip()
            if needle:
                raw_ids = await User.filter(
                    Q(username__icontains=needle) | Q(email__icontains=needle) | Q(display_name__icontains=needle)
                ).values_list("id", flat=True)
                ids = [UUID(str(x)) for x in raw_ids] if raw_ids else []
                if not ids:
                    return PageData[WorkspaceInviteLinkParticipantOut](
                        items=[],
                        total=0,
                        page=params.page,
                        size=params.size,
                        pages=0,
                        next=None,
                        prev=None,
                    )
                qs = qs.filter(used_by_user_id__in=ids)

        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.order_by("-used_at").limit(params.limit).offset(params.offset).all()

        user_ids: list[UUID] = []
        for r in rows:
            if r.used_by_user_id:
                user_ids.append(UUID(str(r.used_by_user_id)))

        users = await User.filter(id__in=user_ids).all() if user_ids else []
        user_by_id = {UUID(str(u.id)): u for u in users}

        items: list[WorkspaceInviteLinkParticipantOut] = []
        for e in rows:
            uid = UUID(str(e.used_by_user_id))
            u = user_by_id.get(uid)
            if u is None:
                continue
            items.append(WorkspaceInviteLinkParticipantOut(user=_user_ref(u), used_at=e.used_at))

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[WorkspaceInviteLinkParticipantOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def list_email_invites(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        status: str | None,
        mine: bool | None,
        current_user_id: UUID,
    ) -> PageData[WorkspaceEmailInviteOut]:
        qs = WorkspaceEmailInvite.filter(organization_id=organization_id, workspace_id=workspace_id)
        now = datetime.now(UTC)
        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(Q(email__icontains=needle) | Q(role_code__icontains=needle))
        if mine:
            qs = qs.filter(created_by_user_id=current_user_id)
        if status:
            s = status.strip().lower()
            if s == "accepted":
                qs = qs.filter(accepted_at__not_isnull=True)
            elif s == "revoked":
                qs = qs.filter(revoked_at__not_isnull=True)
            elif s == "expired":
                qs = qs.filter(accepted_at=None, revoked_at=None, expires_at__not_isnull=True, expires_at__lte=now)
            elif s == "pending":
                qs = qs.filter(accepted_at=None, revoked_at=None).filter(
                    Q(expires_at__isnull=True) | Q(expires_at__gt=now)
                )

        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = (
            await qs
            .order_by(*_normalize_workspace_email_invite_ordering(ordering))
            .limit(params.limit)
            .offset(params.offset)
            .all()
        )

        user_ids: set[UUID] = set()
        for r in rows:
            user_ids.add(UUID(str(r.created_by_user_id)))
            if r.accepted_by_user_id:
                user_ids.add(UUID(str(r.accepted_by_user_id)))
        users = await User.filter(id__in=list(user_ids)).all() if user_ids else []
        user_by_id = {UUID(str(u.id)): u for u in users}

        items: list[WorkspaceEmailInviteOut] = []
        for inv in rows:
            inviter = user_by_id.get(UUID(str(inv.created_by_user_id)))
            accepted_by = user_by_id.get(UUID(str(inv.accepted_by_user_id))) if inv.accepted_by_user_id else None
            items.append(
                WorkspaceEmailInviteOut(
                    id=inv.id,
                    email=inv.email,
                    role_code=inv.role_code,
                    expires_at=inv.expires_at,
                    created_by_user_id=inv.created_by_user_id,
                    created_by=_user_ref(inviter) if inviter else None,
                    accepted_by_user_id=inv.accepted_by_user_id,
                    accepted_by=_user_ref(accepted_by) if accepted_by else None,
                    accepted_at=inv.accepted_at,
                    revoked_at=inv.revoked_at,
                    status=self._compute_invite_status(
                        accepted_at=inv.accepted_at, revoked_at=inv.revoked_at, expires_at=inv.expires_at
                    ),
                    created_at=inv.created_at,
                    updated_at=inv.updated_at,
                )
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None
        return PageData[WorkspaceEmailInviteOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )
