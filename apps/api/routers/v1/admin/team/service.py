from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
from apps.api.core.i18n import t
from apps.api.core.organization.invitations import (
    InvitationRepository,
    build_expires_at,
    generate_invite_token,
    hash_invite_token,
)
from apps.api.http.pagination import PageData, PageParams
from apps.api.models.invitation import OrganizationInvitation
from apps.api.models.organization import MembershipStatus
from apps.api.routers.v1.admin.team.repository import TeamRepository
from apps.api.routers.v1.admin.team.schema import (
    InvitationStatus,
    TeamInvitationCreateRequest,
    TeamInvitationCreateResult,
    TeamInvitationListQuery,
    TeamInvitationOut,
    TeamMemberOut,
    TeamMemberRoleSetRequest,
)


class TeamService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = TeamRepository()
        self.inv_repo = InvitationRepository()

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
            role_codes = sorted({mr.role.code for mr in (membership.membership_roles or []) if mr.role})
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

        inv = await self.inv_repo.create_invitation(
            organization_id=organization_id,
            email=email,
            role_code=role_code,
            token_hash=token_hash,
            invited_by_user_id=invited_by_user_id,
            expires_at=expires_at,
        )

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

    async def list_invitations(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        filters: TeamInvitationListQuery,
    ) -> PageData[TeamInvitationOut]:
        qs = self.inv_repo.query_invitations(organization_id=organization_id)
        qs = self.inv_repo.apply_filters(qs=qs, q=filters.q, status=(filters.status.value if filters.status else None))

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
        if inv.accepted_at is not None:
            raise BadRequest(
                message=t("errors", "INVITATION_ALREADY_ACCEPTED", default="邀请已被接受，无法撤销"),
                error="INVITATION_ALREADY_ACCEPTED",
            )
        if inv.revoked_at is not None:
            return
        inv.revoked_at = datetime.now(UTC)
        await inv.save(update_fields=["revoked_at"])
