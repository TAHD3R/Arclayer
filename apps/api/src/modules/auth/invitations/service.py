from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import UUID

from tortoise.expressions import Q

from src.common.invitations.tokens.service import verify_invite_token
from src.common.invitations.workspace_invites import (
    is_workspace_email_invite_code,
    is_workspace_invite_link_code,
)
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import get_current_locale, t
from src.models.organization.org_invitation import OrganizationEmailInvite, OrganizationInviteLink
from src.models.organization.org_rbac import OrganizationRole
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.system.rbac import Permission, Role
from src.models.workspaces.workspace import (
    Workspace,
)
from src.models.workspaces.workspace_invite import (
    WorkspaceEmailInvite,
    WorkspaceInviteLink,
)
from src.modules.auth.invitations.acceptance.service import AuthInvitationAcceptanceService
from src.modules.auth.schema import (
    AcceptExistingInvitationRequest,
    AcceptExistingInvitationResult,
    AcceptInvitationRequest,
    InvitationPreviewInvitationOut,
    InvitationPreviewInviterOut,
    InvitationPreviewOrganizationOut,
    InvitationPreviewResult,
    InvitationPreviewRoleOut,
    InvitationPreviewWorkspaceOut,
    MyInvitationInviterOut,
    MyInvitationListQuery,
    MyInvitationOrganizationOut,
    MyInvitationOut,
    MyInvitationWorkspaceOut,
    TokenPair,
)
from src.modules.organization.rbac.service import OrganizationRBACService


class AuthInvitationService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.acceptance_service = AuthInvitationAcceptanceService(settings)

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    @staticmethod
    def mask_email(email: str) -> str:
        """
        Mask an email address for safer display.

        Examples:
        - john@example.com -> jo***n@example.com
        - a@example.com -> a***@example.com
        """

        raw = (email or "").strip()
        if "@" not in raw:
            return raw
        local, domain = raw.split("@", 1)
        if not local:
            return f"***@{domain}"
        if len(local) <= 2:
            return f"{local[0]}***@{domain}"
        return f"{local[:2]}***{local[-1]}@{domain}"

    async def ensure_role_codes_have_admin_access(self, *, workspace_id: UUID, role_codes: list[str], conn) -> None:
        """
        Defensive invariant for onboarding flows:
        user must be able to access admin console after accepting the invitation.
        """

        codes = sorted({(c or "").strip() for c in (role_codes or []) if (c or "").strip()})
        if not codes:
            raise Forbidden(
                message=self._ta("INVITE_ROLE_NO_ADMIN_ACCESS", "邀请角色未包含后台访问权限"),
                error="INVITE_ROLE_MISSING_ADMIN_ACCESS",
            )

        # Superuser roles implicitly have all permissions.
        if await Role.filter(workspace_id=workspace_id, code__in=codes, is_superuser=True).using_db(conn).exists():
            return

        ok = (
            await Permission
            .filter(
                code="admin:access",
                scope="workspace",
                permission_roles__role__workspace_id=workspace_id,
                permission_roles__role__code__in=codes,
            )
            .using_db(conn)
            .exists()
        )
        if not ok:
            raise Forbidden(
                message=self._ta("INVITE_ROLE_NO_ADMIN_ACCESS", "邀请角色未包含后台访问权限"),
                error="INVITE_ROLE_MISSING_ADMIN_ACCESS",
            )

    async def list_my_invitations(
        self,
        *,
        user: User,
        params: PageParams,
        filters: MyInvitationListQuery,
    ) -> PageData[MyInvitationOut]:
        email = (user.email or "").strip().lower()
        if not email:
            return PageData[MyInvitationOut](
                items=[],
                total=0,
                page=params.page,
                size=params.size,
                pages=0,
                next=None,
                prev=None,
            )

        now = datetime.now(UTC)

        status = (filters.status or "").strip().lower() if filters.status else ""

        ws_qs = WorkspaceEmailInvite.filter(email=email).select_related("organization", "workspace")
        org_qs = OrganizationEmailInvite.filter(email=email).select_related("organization")

        if status == "accepted":
            ws_qs = ws_qs.filter(accepted_by_user_id=user.id, accepted_at__not_isnull=True)
            org_qs = org_qs.filter(accepted_by_user_id=user.id, accepted_at__not_isnull=True)
        else:
            # Default to pending.
            ws_qs = ws_qs.filter(accepted_at=None, revoked_at=None).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=now)
            )
            org_qs = org_qs.filter(accepted_at=None, revoked_at=None).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=now)
            )

        if filters.q:
            needle = filters.q.strip()
            if needle:
                ws_qs = ws_qs.filter(
                    Q(role_code__icontains=needle)
                    | Q(organization__name__icontains=needle)
                    | Q(workspace__name__icontains=needle)
                )
                org_qs = org_qs.filter(
                    Q(role_code__icontains=needle)
                    | Q(organization__name__icontains=needle)
                    | Q(email__icontains=needle)
                )

        ws_rows = await ws_qs.all()
        org_rows = await org_qs.all()

        merged: list[tuple[datetime, str, WorkspaceEmailInvite | OrganizationEmailInvite]] = []
        for row in ws_rows:
            order_ts = row.accepted_at if status == "accepted" else row.created_at
            merged.append((order_ts, "workspace", row))
        for row in org_rows:
            order_ts = row.accepted_at if status == "accepted" else row.created_at
            merged.append((order_ts, "organization", row))

        merged.sort(key=lambda item: item[0], reverse=True)

        total = len(merged)
        pages = (total + params.size - 1) // params.size if params.size else 0
        page_rows = merged[params.offset : params.offset + params.limit]

        inviter_ids: set[UUID] = set()
        for _, _, inv in page_rows:
            if inv.created_by_user_id is not None:
                inviter_ids.add(UUID(str(inv.created_by_user_id)))

        inviter_map: dict[UUID, MyInvitationInviterOut] = {}
        if inviter_ids:
            inviter_rows = await User.filter(id__in=list(inviter_ids)).all()
            for u in inviter_rows:
                inviter_map[u.id] = MyInvitationInviterOut(
                    id=u.id,
                    username=u.username,
                    email=u.email,
                    display_name=u.display_name,
                    avatar_url=u.avatar_url,
                )

        items: list[MyInvitationOut] = []
        for _order_ts, scope, inv in page_rows:
            org = inv.organization
            org_out = MyInvitationOrganizationOut(id=org.id, name=org.name, slug=org.slug, logo_url=org.logo_url)

            ws_out: MyInvitationWorkspaceOut | None = None
            if scope == "workspace":
                ws_inv = inv
                if isinstance(ws_inv, WorkspaceEmailInvite):
                    ws = ws_inv.workspace
                    ws_out = MyInvitationWorkspaceOut(id=ws.id, name=ws.name, slug=ws.slug)

            inviter = inviter_map.get(UUID(str(inv.created_by_user_id))) if inv.created_by_user_id is not None else None

            is_accepted = inv.accepted_at is not None and str(inv.accepted_by_user_id) == str(user.id)
            out_status = "accepted" if is_accepted else "pending"

            items.append(
                MyInvitationOut(
                    id=inv.id,
                    email=inv.email,
                    role_code=inv.role_code,
                    expires_at=inv.expires_at,
                    organization=org_out,
                    workspace=ws_out,
                    inviter=inviter,
                    status=out_status,
                    accepted_at=inv.accepted_at,
                    created_at=inv.created_at,
                    updated_at=inv.updated_at,
                )
            )

        next_page = params.page + 1 if pages and params.page < pages else None
        prev_page = min(params.page - 1, pages) if pages and params.page > 1 else None

        return PageData[MyInvitationOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def accept_invitation(
        self,
        *,
        payload: AcceptInvitationRequest,
        ensure_password_strength: Callable[[str], None],
        issue_tokens: Callable[..., Awaitable[TokenPair]],
    ) -> TokenPair:
        return await self.acceptance_service.accept_invitation(
            payload=payload,
            ensure_password_strength=ensure_password_strength,
            issue_tokens=issue_tokens,
            ensure_role_codes_have_admin_access=self.ensure_role_codes_have_admin_access,
        )

    async def preview_invitation(self, *, token: str) -> InvitationPreviewResult:
        token = (token or "").strip()
        if not token:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        now = datetime.now(UTC)
        code = verify_invite_token(self.settings, token=token)
        if code is None:
            raise BadRequest(
                message=self._ta("INVITE_TOKEN_INVALID", "邀请 Token 无效"),
                error="INVITE_TOKEN_INVALID",
            )

        inviter_user_id: UUID | None = None
        role_code: str | None = None
        expires_at: datetime | None = None
        invitation_email: str | None = None

        org: Organization | None = None
        ws: Workspace | None = None
        is_org_scope = False

        if is_workspace_invite_link_code(code):
            link = await WorkspaceInviteLink.get_or_none(code=code).select_related("organization", "workspace")
            if link is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
            if link.disabled_at is not None:
                raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
            if link.expires_at is not None and link.expires_at <= now:
                raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
            if link.max_uses is not None and int(link.uses_count or 0) >= int(link.max_uses):
                raise Forbidden(
                    message=self._ta("INVITE_REVOKED", "邀请不可用"),
                    error="INVITE_MAX_USES_REACHED",
                )

            org = link.organization
            ws = link.workspace
            role_code = link.role_code
            inviter_user_id = link.created_by_user_id
            expires_at = link.expires_at
            invitation_email = None
        elif is_workspace_email_invite_code(code):
            inv = await WorkspaceEmailInvite.get_or_none(code=code).select_related("organization", "workspace")
            if inv is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
            if inv.revoked_at is not None:
                raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
            if inv.accepted_at is not None:
                raise Conflict(
                    message=self._ta("INVITE_REVOKED", "邀请不可用"),
                    error="INVITE_ALREADY_ACCEPTED",
                )
            if inv.expires_at is not None and inv.expires_at <= now:
                raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

            org = inv.organization
            ws = inv.workspace
            role_code = inv.role_code
            inviter_user_id = inv.created_by_user_id
            expires_at = inv.expires_at
            invitation_email = inv.email
        elif code.startswith("ol_"):
            link = await OrganizationInviteLink.get_or_none(code=code).select_related("organization")
            if link is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
            if link.disabled_at is not None:
                raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
            if link.expires_at is not None and link.expires_at <= now:
                raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")
            if link.max_uses is not None and int(link.uses_count or 0) >= int(link.max_uses):
                raise Forbidden(
                    message=self._ta("INVITE_REVOKED", "邀请不可用"),
                    error="INVITE_MAX_USES_REACHED",
                )

            org = link.organization
            role_code = link.role_code
            inviter_user_id = link.created_by_user_id
            expires_at = link.expires_at
            invitation_email = None
            is_org_scope = True
        elif code.startswith("oi_"):
            inv = await OrganizationEmailInvite.get_or_none(code=code).select_related("organization")
            if inv is None:
                raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")
            if inv.revoked_at is not None:
                raise Forbidden(message=self._ta("INVITE_REVOKED", "邀请已被撤销"), error="INVITE_REVOKED")
            if inv.accepted_at is not None:
                raise Conflict(
                    message=self._ta("INVITE_REVOKED", "邀请不可用"),
                    error="INVITE_ALREADY_ACCEPTED",
                )
            if inv.expires_at is not None and inv.expires_at <= now:
                raise Forbidden(message=self._ta("INVITE_EXPIRED", "邀请已过期"), error="INVITE_EXPIRED")

            org = inv.organization
            role_code = inv.role_code
            inviter_user_id = inv.created_by_user_id
            expires_at = inv.expires_at
            invitation_email = inv.email
            is_org_scope = True
        else:
            raise NotFound(message=self._ta("INVITE_NOT_FOUND", "邀请不存在"), error="INVITE_NOT_FOUND")

        if org is None or not org.is_active:
            raise Forbidden(message=self._ta("ORG_INACTIVE", "组织不可用"), error="ORG_INACTIVE")
        if not is_org_scope and (ws is None or not ws.is_active or ws.archived_at is not None):
            raise Forbidden(message=t("errors", "NOT_FOUND", default="资源不存在"), error="WORKSPACE_INACTIVE")

        inviter: InvitationPreviewInviterOut | None = None
        if inviter_user_id is not None:
            u = await User.get_or_none(id=inviter_user_id)
            if u is not None:
                inviter = InvitationPreviewInviterOut(
                    id=u.id,
                    username=u.username,
                    display_name=u.display_name,
                    avatar_url=u.avatar_url,
                )

        role_out: InvitationPreviewRoleOut | None = None
        if ws is not None:
            role_obj: Role | None = None
            if role_code:
                role_obj = await Role.get_or_none(workspace_id=ws.id, code=role_code)
            if role_obj is None:
                role_obj = await Role.get_or_none(workspace_id=ws.id, code="viewer")
            if role_obj is None:
                role_obj = await Role.filter(workspace_id=ws.id, is_default=True).order_by("code").first()
            if role_obj is not None:
                # Localize role name/description for preview UX.
                from src.modules.system.rbac.service import RBACService

                rbac = RBACService(self.settings)
                localized = rbac.localize_role(role_obj, locale=get_current_locale())
                localized_desc = localized.get("description")
                role_out = InvitationPreviewRoleOut(
                    code=role_obj.code,
                    name=str(localized.get("name") or role_obj.code),
                    description=str(localized_desc) if isinstance(localized_desc, str) and localized_desc else None,
                )
        else:
            await OrganizationRBACService(self.settings).ensure_defaults(organization_id=org.id)
            org_role: OrganizationRole | None = None
            if role_code:
                org_role = await OrganizationRole.get_or_none(organization_id=org.id, code=role_code)
            if org_role is None:
                org_role = await OrganizationRole.get_or_none(organization_id=org.id, code="member")
            if org_role is not None:
                role_out = InvitationPreviewRoleOut(
                    code=org_role.code,
                    name=org_role.name,
                    description=org_role.description,
                )

        user_exists = bool(invitation_email) and await User.filter(email=invitation_email).exists()

        return InvitationPreviewResult(
            invitation=InvitationPreviewInvitationOut(
                email=invitation_email,
                masked_email=self.mask_email(invitation_email) if invitation_email else None,
                role_code=role_code,
                expires_at=expires_at,
            ),
            organization=InvitationPreviewOrganizationOut(
                id=org.id,
                name=org.name,
                slug=org.slug,
                logo_url=org.logo_url,
            ),
            workspace=(
                InvitationPreviewWorkspaceOut(
                    id=ws.id,
                    name=ws.name,
                    slug=ws.slug,
                )
                if ws is not None
                else None
            ),
            inviter=inviter,
            role=role_out,
            user_exists=bool(user_exists),
        )

    async def accept_existing_invitation(
        self,
        *,
        payload: AcceptExistingInvitationRequest,
        user: User,
    ) -> AcceptExistingInvitationResult:
        return await self.acceptance_service.accept_existing_invitation(
            payload=payload,
            user=user,
            ensure_role_codes_have_admin_access=self.ensure_role_codes_have_admin_access,
        )
