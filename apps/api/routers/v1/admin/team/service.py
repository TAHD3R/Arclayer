from __future__ import annotations

import secrets
from datetime import UTC, datetime
from uuid import UUID

from apps.api.common.email.service import EmailService
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.core.i18n import t
from apps.api.core.organization.invitations import (
    InvitationRepository,
    build_expires_at,
    generate_invite_token,
    hash_invite_token,
)
from apps.api.core.organization.invite_links import InviteLinkRepository
from apps.api.models.invitation import OrganizationInvitation, OrganizationInviteLink
from apps.api.models.organization import MembershipStatus, Organization
from apps.api.models.user import User
from apps.api.routers.v1.admin.team.repository import TeamRepository
from apps.api.routers.v1.admin.team.schema import (
    InvitationStatus,
    TeamInvitationCreateRequest,
    TeamInvitationCreateResult,
    TeamInvitationListQuery,
    TeamInvitationOut,
    TeamInvitationRenewRequest,
    TeamInviteLinkCreateRequest,
    TeamInviteLinkCreateResult,
    TeamInviteLinkListQuery,
    TeamInviteLinkOut,
    TeamInviteLinkRenewRequest,
    TeamMemberOut,
    TeamMemberRoleSetRequest,
    TeamUserRefOut,
)


class TeamService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = TeamRepository()
        self.inv_repo = InvitationRepository()
        self.link_repo = InviteLinkRepository()
        self.email_service = EmailService(settings)

    async def _generate_invite_link_code(self) -> str:
        # `code` is a non-secret identifier for UI display; avoid collisions.
        for _ in range(5):
            candidate = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
            if not candidate:
                continue
            exists = await OrganizationInviteLink.filter(code=candidate).exists()
            if not exists:
                return candidate
        raise BadRequest(
            message=t("errors", "FAILED_TO_CREATE_INVITE_LINK", default="创建邀请链接失败"),
            error="FAILED_TO_CREATE_INVITE_LINK",
        )

    def _compute_invitation_status(self, inv: OrganizationInvitation) -> InvitationStatus:
        if inv.accepted_at is not None:
            return InvitationStatus.ACCEPTED
        if inv.revoked_at is not None:
            return InvitationStatus.REVOKED
        if inv.expires_at is not None and inv.expires_at <= datetime.now(UTC):
            return InvitationStatus.EXPIRED
        return InvitationStatus.PENDING

    async def list_members(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        filters,
    ) -> PageData[TeamMemberOut]:
        qs = self.repo.query_memberships(organization_id=organization_id, filters=filters)
        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).prefetch_related("membership_roles__role").all()

        items: list[TeamMemberOut] = []
        for membership in rows:
            membership_roles = getattr(membership, "membership_roles", None) or []
            role_codes = sorted({mr.role.code for mr in membership_roles if mr.role})
            user = membership.user
            items.append(
                TeamMemberOut(
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
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None

        return PageData[TeamMemberOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def set_member_roles(
        self,
        *,
        organization_id: UUID,
        membership_id: UUID,
        payload: TeamMemberRoleSetRequest,
    ) -> None:
        membership = await self.repo.get_membership(membership_id=membership_id, organization_id=organization_id)
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        if membership.status != MembershipStatus.ACTIVE:
            raise BadRequest(
                message=t("errors", "MEMBERSHIP_NOT_ACTIVE", default="成员状态不可用"),
                error="MEMBERSHIP_NOT_ACTIVE",
            )

        role_codes = [c.strip() for c in (payload.role_codes or []) if c and c.strip()]
        roles = await self.repo.get_roles_by_codes(role_codes=role_codes)
        found = {r.code for r in roles}
        missing = [c for c in role_codes if c not in found]
        if missing:
            raise BadRequest(
                message=t("errors", "ROLE_NOT_FOUND", default="角色不存在"),
                error="ROLE_NOT_FOUND",
                meta={"missing": missing},
            )

        await self.repo.replace_membership_roles(membership_id=membership.id, role_ids=[r.id for r in roles])

    async def create_invitation(
        self,
        *,
        organization_id: UUID,
        invited_by_user_id: UUID,
        payload: TeamInvitationCreateRequest,
    ) -> TeamInvitationCreateResult:
        email = str(payload.email).strip().lower()
        role_code = payload.role_code.strip() if payload.role_code else None

        if role_code:
            roles = await self.repo.get_roles_by_codes(role_codes=[role_code])
            if not roles:
                raise BadRequest(
                    message=t("errors", "ROLE_NOT_FOUND", default="角色不存在"),
                    error="ROLE_NOT_FOUND",
                    meta={"missing": [role_code]},
                )

        token = generate_invite_token()
        token_hash = hash_invite_token(token)
        expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)

        # Unify semantics: an "invitation" is also an invite link (reusable).
        # Email sending is an optional delivery channel; link remains valid until expired/disabled.
        code = await self._generate_invite_link_code()
        await self.link_repo.create_link(
            organization_id=organization_id,
            role_code=role_code,
            token_hash=token_hash,
            code=code,
            expires_at=expires_at,
            created_by_user_id=invited_by_user_id,
        )

        try:
            inv = await self.inv_repo.create_invitation(
                organization_id=organization_id,
                email=email,
                role_code=role_code,
                token_hash=token_hash,
                invited_by_user_id=invited_by_user_id,
                expires_at=expires_at,
            )
        except Exception:
            # Best-effort cleanup to avoid leaving an orphaned invite link if invitation creation fails.
            await OrganizationInviteLink.filter(
                organization_id=organization_id,
                token_hash=token_hash,
            ).delete()
            raise

        base = (self.settings.application.frontend_base_url or "").strip()
        base = base.rstrip("/") if base else ""
        # Keep URL consistent with reset-password links (frontend_base_url points to admin web root).
        invite_url = f"{base}/accept-invite?token={token}" if base else None

        out = TeamInvitationOut(
            id=inv.id,
            email=inv.email,
            role_code=inv.role_code,
            expires_at=inv.expires_at,
            invited_by_user_id=inv.invited_by_user_id,
            accepted_by_user_id=inv.accepted_by_user_id,
            accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
            status=self._compute_invitation_status(inv),
            created_at=inv.created_at,
            updated_at=inv.updated_at,
        )
        return TeamInvitationCreateResult(invitation=out, token=token, invite_url=invite_url)

    async def send_invitation_email(
        self,
        *,
        organization_id: UUID,
        recipient: str,
        token: str,
        invite_url: str | None,
        expires_at: datetime | None,
        invited_by_user_id: UUID | None,
        locale: str | None,
    ) -> None:
        org_name: str | None = None
        try:
            org = await Organization.get_or_none(id=organization_id)
            org_name = org.name if org else None
        except Exception:
            org_name = None

        await self.email_service.send_invitation(
            recipient=recipient,
            invite_url=invite_url,
            invite_token=token,
            expires_at=expires_at,
            organization_name=org_name,
            invited_by_user_id=str(invited_by_user_id) if invited_by_user_id else None,
            locale=locale,
        )

    async def list_invitations(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        filters: TeamInvitationListQuery,
    ) -> PageData[TeamInvitationOut]:
        qs = self.inv_repo.query_invitations(organization_id=organization_id)
        # NOTE: BaseSchema enables `use_enum_values=True`, so `filters.status` may already be a plain string.
        status: str | None = None
        if filters.status is not None:
            status = filters.status.value if isinstance(filters.status, InvitationStatus) else str(filters.status)
        qs = self.inv_repo.apply_filters(qs=qs, q=filters.q, status=status)

        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).order_by("-created_at").all()

        items: list[TeamInvitationOut] = []
        for inv in rows:
            items.append(
                TeamInvitationOut(
                    id=inv.id,
                    email=inv.email,
                    role_code=inv.role_code,
                    expires_at=inv.expires_at,
                    invited_by_user_id=inv.invited_by_user_id,
                    accepted_by_user_id=inv.accepted_by_user_id,
                    accepted_at=inv.accepted_at,
                    revoked_at=inv.revoked_at,
                    status=self._compute_invitation_status(inv),
                    created_at=inv.created_at,
                    updated_at=inv.updated_at,
                )
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None

        return PageData[TeamInvitationOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def revoke_invitation(
        self,
        *,
        organization_id: UUID,
        invitation_id: UUID,
    ) -> None:
        inv = await OrganizationInvitation.get_or_none(id=invitation_id, organization_id=organization_id)
        if inv is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        if inv.revoked_at is not None:
            return
        inv.revoked_at = datetime.now(UTC)
        await inv.save(update_fields=["revoked_at"])
        # Disable the underlying invite link as well.
        await OrganizationInviteLink.filter(
            organization_id=organization_id,
            token_hash=inv.token_hash,
            disabled_at=None,
        ).update(disabled_at=inv.revoked_at)

    async def renew_invitation(
        self,
        *,
        organization_id: UUID,
        invitation_id: UUID,
        payload: TeamInvitationRenewRequest,
    ) -> TeamInvitationOut:
        inv = await OrganizationInvitation.get_or_none(id=invitation_id, organization_id=organization_id)
        if inv is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        if inv.revoked_at is not None:
            raise BadRequest(
                message=t("errors", "INVITATION_REVOKED", default="邀请已被禁用，无法续订"),
                error="INVITATION_REVOKED",
            )

        inv.expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)
        await inv.save(update_fields=["expires_at"])
        # Keep the invite link expiry in sync.
        await OrganizationInviteLink.filter(
            organization_id=organization_id,
            token_hash=inv.token_hash,
            disabled_at=None,
        ).update(expires_at=inv.expires_at)

        return TeamInvitationOut(
            id=inv.id,
            email=inv.email,
            role_code=inv.role_code,
            expires_at=inv.expires_at,
            invited_by_user_id=inv.invited_by_user_id,
            accepted_by_user_id=inv.accepted_by_user_id,
            accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
            status=self._compute_invitation_status(inv),
            created_at=inv.created_at,
            updated_at=inv.updated_at,
        )

    async def delete_invitation(
        self,
        *,
        organization_id: UUID,
        invitation_id: UUID,
    ) -> None:
        inv = await OrganizationInvitation.get_or_none(id=invitation_id, organization_id=organization_id)
        if inv is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        # Be conservative: deleting an invitation should also prevent future joins via the token.
        now = datetime.now(UTC)
        await OrganizationInviteLink.filter(
            organization_id=organization_id,
            token_hash=inv.token_hash,
            disabled_at=None,
        ).update(disabled_at=now)
        await OrganizationInvitation.filter(id=invitation_id, organization_id=organization_id).delete()

    async def _resolve_users(self, user_ids: set[UUID]) -> dict[UUID, TeamUserRefOut]:
        if not user_ids:
            return {}
        rows = await User.filter(id__in=list(user_ids)).all()
        out: dict[UUID, TeamUserRefOut] = {}
        for u in rows:
            out[u.id] = TeamUserRefOut(
                user_id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
            )
        return out

    async def list_invite_links(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        filters: TeamInviteLinkListQuery,
        requesting_user_id: UUID | None = None,
    ) -> PageData[TeamInviteLinkOut]:
        qs = self.link_repo.query_links(organization_id=organization_id)
        if filters.mine is True and requesting_user_id is not None:
            qs = qs.filter(created_by_user_id=requesting_user_id)
        qs = self.link_repo.apply_filters(qs=qs, q=filters.q)

        total = int(await qs.count())
        pages = (total + params.size - 1) // params.size if params.size else 0
        rows = await qs.limit(params.limit).offset(params.offset).order_by("-created_at").all()

        user_ids: set[UUID] = set()
        for link in rows:
            if link.created_by_user_id:
                user_ids.add(UUID(str(link.created_by_user_id)))
            if link.last_used_by_user_id:
                user_ids.add(UUID(str(link.last_used_by_user_id)))
        users = await self._resolve_users(user_ids)

        items: list[TeamInviteLinkOut] = []
        for link in rows:
            created_by = None
            if link.created_by_user_id:
                created_by = users.get(UUID(str(link.created_by_user_id)))
            last_used_by = None
            if link.last_used_by_user_id:
                last_used_by = users.get(UUID(str(link.last_used_by_user_id)))

            items.append(
                TeamInviteLinkOut(
                    id=link.id,
                    code=link.code,
                    role_code=link.role_code,
                    expires_at=link.expires_at,
                    disabled_at=link.disabled_at,
                    created_by=created_by,
                    last_used_by=last_used_by,
                    last_used_at=link.last_used_at,
                    uses_count=int(link.uses_count or 0),
                    created_at=link.created_at,
                    updated_at=link.updated_at,
                )
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None

        return PageData[TeamInviteLinkOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def create_invite_link(
        self,
        *,
        organization_id: UUID,
        created_by_user_id: UUID,
        payload: TeamInviteLinkCreateRequest,
    ) -> TeamInviteLinkCreateResult:
        role_code = payload.role_code.strip() if payload.role_code else None
        if role_code:
            roles = await self.repo.get_roles_by_codes(role_codes=[role_code])
            if not roles:
                raise BadRequest(
                    message=t("errors", "ROLE_NOT_FOUND", default="角色不存在"),
                    error="ROLE_NOT_FOUND",
                    meta={"missing": [role_code]},
                )

        token = generate_invite_token()
        token_hash = hash_invite_token(token)
        expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)

        code = await self._generate_invite_link_code()

        link = await self.link_repo.create_link(
            organization_id=organization_id,
            role_code=role_code,
            token_hash=token_hash,
            code=code,
            expires_at=expires_at,
            created_by_user_id=created_by_user_id,
        )

        # Optional: create delivery records bound to recipient emails.
        # This powers "my invitations" listing and preserves an audit trail for emailed deliveries.
        emails: list[str] = []
        if payload.emails:
            seen: set[str] = set()
            for raw in payload.emails:
                e = str(raw).strip().lower()
                if not e or e in seen:
                    continue
                seen.add(e)
                emails.append(e)

        for email in emails:
            await self.inv_repo.create_invitation(
                organization_id=organization_id,
                email=email,
                role_code=role_code,
                token_hash=token_hash,
                invited_by_user_id=created_by_user_id,
                expires_at=expires_at,
            )

        base = (self.settings.application.frontend_base_url or "").strip()
        base = base.rstrip("/") if base else ""
        # Keep URL consistent with the current invite entrypoint.
        invite_url = f"{base}/accept-invite?token={token}" if base else None

        creator = await self._resolve_users({created_by_user_id})
        out = TeamInviteLinkOut(
            id=link.id,
            code=link.code,
            role_code=link.role_code,
            expires_at=link.expires_at,
            disabled_at=link.disabled_at,
            created_by=creator.get(created_by_user_id),
            last_used_by=None,
            last_used_at=None,
            uses_count=int(link.uses_count or 0),
            created_at=link.created_at,
            updated_at=link.updated_at,
        )
        return TeamInviteLinkCreateResult(link=out, token=token, invite_url=invite_url)

    async def renew_invite_link(
        self,
        *,
        organization_id: UUID,
        link_id: UUID,
        payload: TeamInviteLinkRenewRequest,
    ) -> TeamInviteLinkOut:
        link = await OrganizationInviteLink.get_or_none(id=link_id, organization_id=organization_id)
        if link is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        if link.disabled_at is not None:
            raise BadRequest(
                message=t("errors", "INVITE_LINK_DISABLED", default="邀请链接已停用，无法续订"),
                error="INVITE_LINK_DISABLED",
            )

        link.expires_at = build_expires_at(expires_in_seconds=payload.expires_in_seconds)
        await link.save(update_fields=["expires_at"])
        # Keep legacy email-bound invitations (if any) aligned with the link lifecycle.
        await OrganizationInvitation.filter(
            organization_id=organization_id,
            token_hash=link.token_hash,
            revoked_at=None,
            accepted_at=None,
        ).update(expires_at=link.expires_at)

        user_ids: set[UUID] = set()
        if link.created_by_user_id:
            user_ids.add(UUID(str(link.created_by_user_id)))
        if link.last_used_by_user_id:
            user_ids.add(UUID(str(link.last_used_by_user_id)))
        users = await self._resolve_users(user_ids)

        return TeamInviteLinkOut(
            id=link.id,
            code=link.code,
            role_code=link.role_code,
            expires_at=link.expires_at,
            disabled_at=link.disabled_at,
            created_by=users.get(UUID(str(link.created_by_user_id))) if link.created_by_user_id else None,
            last_used_by=users.get(UUID(str(link.last_used_by_user_id))) if link.last_used_by_user_id else None,
            last_used_at=link.last_used_at,
            uses_count=int(link.uses_count or 0),
            created_at=link.created_at,
            updated_at=link.updated_at,
        )

    async def disable_invite_link(self, *, organization_id: UUID, link_id: UUID) -> None:
        updated = await self.link_repo.disable_link(organization_id=organization_id, link_id=link_id)
        if updated <= 0:
            # Be conservative: return NOT_FOUND for non-existent or already disabled.
            link = await OrganizationInviteLink.get_or_none(id=link_id, organization_id=organization_id)
            if link is None:
                raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
            return

        # Sync legacy email invitations (best-effort): mark as revoked so the invitee doesn't see a "pending" invite.
        link = await OrganizationInviteLink.get_or_none(id=link_id, organization_id=organization_id)
        if link is not None:
            now = datetime.now(UTC)
            await OrganizationInvitation.filter(
                organization_id=organization_id,
                token_hash=link.token_hash,
                revoked_at=None,
                accepted_at=None,
            ).update(revoked_at=now)

    async def disable_all_invite_links(self, *, organization_id: UUID) -> None:
        now = datetime.now(UTC)
        await self.link_repo.disable_all(organization_id=organization_id, now=now)
        # Sync legacy email invitations (best-effort).
        await OrganizationInvitation.filter(
            organization_id=organization_id,
            revoked_at=None,
            accepted_at=None,
        ).update(revoked_at=now)
