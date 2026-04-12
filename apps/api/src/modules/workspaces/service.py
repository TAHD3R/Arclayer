from __future__ import annotations

from collections import defaultdict
from typing import TypedDict, cast
from uuid import UUID

from tortoise.exceptions import IntegrityError

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.common.protocols.tortoise import HasOrganizationId, HasUserId, HasWorkspaceId
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.core.i18n import t
from src.models.assets.asset import AssetPurpose
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.system.rbac import Role
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.assets.admin.assets.binding_align import align_asset_for_binding
from src.modules.assets.public_url import try_extract_asset_uuid_from_relative_public_url
from src.modules.assets.scope import AssetScope
from src.modules.system.rbac.constants.service import ROLE_OWNER
from src.modules.workspaces.schema import (
    LeaveWorkspaceResult,
    MyWorkspaceMemberPreviewOut,
    MyWorkspaceOut,
    WorkspaceDetailOut,
    WorkspaceUpdateRequest,
)
from src.modules.workspaces.slug.service import parse_explicit_workspace_slug


def _resolve_organization_id(value: object) -> UUID:
    return UUID(str(cast(HasOrganizationId, value).organization_id))


def _build_guest_workspace_list(*, workspaces: list[Workspace]) -> list[MyWorkspaceOut]:
    """
    Build workspace list for users without any org memberships.

    This supports explicit workspace-only guest access: a user can have active workspace memberships
    but no organization governance access.
    """

    out: list[MyWorkspaceOut] = []
    for ws in workspaces:
        out.append(
            MyWorkspaceOut(
                id=ws.id,
                workspace_id=ws.id,
                organization_id=_resolve_organization_id(ws),
                slug=ws.slug,
                name=ws.name,
                icon_url=ws.icon_url,
                member_count=0,
                members_preview=[],
                visible_only=False,
                is_creator_admin=False,
            )
        )
    return out


def _collect_org_roles(orgms: list[OrgMembership]) -> tuple[dict[UUID, OrgRole], list[UUID]]:
    org_roles: dict[UUID, OrgRole] = {}
    org_order: list[UUID] = []
    for orgm in orgms:
        org_id = _resolve_organization_id(orgm)
        if org_id in org_roles:
            continue
        org_roles[org_id] = orgm.role
        org_order.append(org_id)
    return org_roles, org_order


def _group_workspaces_by_org(workspaces: list[Workspace]) -> dict[UUID, list[Workspace]]:
    by_org: dict[UUID, list[Workspace]] = defaultdict(list)
    for ws in workspaces:
        by_org[_resolve_organization_id(ws)].append(ws)
    return by_org


class _MemberWorkspaceListArgs(TypedDict):
    org_order: list[UUID]
    org_roles: dict[UUID, OrgRole]
    membership_by_workspace_id: dict[UUID, WorkspaceMembership]
    membership_workspaces_by_org: dict[UUID, list[Workspace]]
    owner_workspaces_by_org: dict[UUID, list[Workspace]]
    user_id: UUID


def _build_member_workspace_list(args: _MemberWorkspaceListArgs) -> list[MyWorkspaceOut]:
    out: list[MyWorkspaceOut] = []
    seen_workspace_ids: set[UUID] = set()

    for org_id in args["org_order"]:
        role = args["org_roles"].get(org_id)
        if role is None:
            continue

        is_owner = role == OrgRole.OWNER
        org_workspaces = (
            args["owner_workspaces_by_org"].get(org_id, [])
            if is_owner
            else args["membership_workspaces_by_org"].get(org_id, [])
        )
        for ws in org_workspaces:
            ws_id = UUID(str(ws.id))
            if ws_id in seen_workspace_ids:
                continue
            seen_workspace_ids.add(ws_id)

            is_creator_admin = is_owner and (UUID(str(ws.created_by_user_id)) == UUID(str(args["user_id"])))
            has_membership = ws_id in args["membership_by_workspace_id"]
            visible_only = bool(is_owner and (not has_membership) and (not is_creator_admin))

            out.append(
                MyWorkspaceOut(
                    id=ws.id,
                    workspace_id=ws.id,
                    organization_id=org_id,
                    slug=ws.slug,
                    name=ws.name,
                    icon_url=ws.icon_url,
                    member_count=0,
                    members_preview=[],
                    visible_only=visible_only,
                    is_creator_admin=is_creator_admin,
                )
            )
    return out


async def _build_workspace_member_meta(
    *,
    workspaces: list[Workspace],
    memberships: list[WorkspaceMembership],
) -> tuple[dict[UUID, int], dict[UUID, list[MyWorkspaceMemberPreviewOut]]]:
    member_ids_by_workspace: dict[UUID, list[UUID]] = defaultdict(list)
    for membership in memberships:
        workspace_id = UUID(str(cast(HasWorkspaceId, membership).workspace_id))
        user_id = cast(HasUserId, membership).user_id
        if user_id is None:
            continue
        member_ids_by_workspace[workspace_id].append(UUID(str(user_id)))

    unique_user_ids = list({user_id for ids in member_ids_by_workspace.values() for user_id in ids})
    users: list[User] = []
    if unique_user_ids:
        users = await User.filter(id__in=unique_user_ids).all()

    user_by_id = {UUID(str(user.id)): user for user in users}
    member_count_by_workspace: dict[UUID, int] = {}
    preview_by_workspace: dict[UUID, list[MyWorkspaceMemberPreviewOut]] = {}

    for workspace in workspaces:
        workspace_id = UUID(str(workspace.id))
        member_ids = member_ids_by_workspace.get(workspace_id, [])
        member_count_by_workspace[workspace_id] = len(member_ids)
        preview_by_workspace[workspace_id] = [
            MyWorkspaceMemberPreviewOut(
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
            )
            for user_id in member_ids[:3]
            if (user := user_by_id.get(user_id)) is not None
        ]

    return member_count_by_workspace, preview_by_workspace


class WorkspaceService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def list_my_workspaces(self, *, user_id: UUID) -> list[MyWorkspaceOut]:
        """
        List workspaces visible to the current user.

        Rules:
        - Non-owner: only active workspaces where user has an ACTIVE workspace membership.
        - Org owner: can see all workspaces in the org; those without membership are marked visible_only.
        - Creator admin: if org owner created the workspace, mark is_creator_admin (and not visible_only).

        Multi-org:
        - A user can belong to multiple organizations.
        - This endpoint aggregates workspaces across all ACTIVE org memberships.
        """
        orgms = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").all()

        memberships = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__is_active=True,
        ).all()
        membership_by_workspace_id = {UUID(str(cast(HasWorkspaceId, m).workspace_id)): m for m in memberships}

        membership_workspace_ids = list(membership_by_workspace_id.keys())
        membership_workspaces: list[Workspace] = []
        if membership_workspace_ids:
            membership_workspaces = (
                await Workspace.filter(id__in=membership_workspace_ids, is_active=True).order_by("created_at").all()
            )

        if not orgms:
            member_count_by_workspace, preview_by_workspace = await _build_workspace_member_meta(
                workspaces=membership_workspaces,
                memberships=memberships,
            )
            items = _build_guest_workspace_list(workspaces=membership_workspaces)
            return self._hydrate_workspace_meta(
                items=items,
                member_count_by_workspace=member_count_by_workspace,
                preview_by_workspace=preview_by_workspace,
            )

        org_roles, org_order = _collect_org_roles(orgms)
        membership_workspaces_by_org = _group_workspaces_by_org(membership_workspaces)

        owner_org_ids = [org_id for org_id in org_order if org_roles.get(org_id) == OrgRole.OWNER]
        owner_workspaces: list[Workspace] = []
        if owner_org_ids:
            owner_workspaces = (
                await Workspace.filter(organization_id__in=owner_org_ids, is_active=True).order_by("created_at").all()
            )
        owner_workspaces_by_org = _group_workspaces_by_org(owner_workspaces)
        visible_workspaces_by_id = {
            UUID(str(workspace.id)): workspace for workspace in [*membership_workspaces, *owner_workspaces]
        }
        visible_workspace_ids = list(visible_workspaces_by_id.keys())
        active_memberships: list[WorkspaceMembership] = []
        if visible_workspace_ids:
            active_memberships = await WorkspaceMembership.filter(
                workspace_id__in=visible_workspace_ids,
                status=WorkspaceMembershipStatus.ACTIVE,
            ).all()
        member_count_by_workspace, preview_by_workspace = await _build_workspace_member_meta(
            workspaces=list(visible_workspaces_by_id.values()),
            memberships=active_memberships,
        )

        items = _build_member_workspace_list({
            "org_order": org_order,
            "org_roles": org_roles,
            "membership_by_workspace_id": membership_by_workspace_id,
            "membership_workspaces_by_org": membership_workspaces_by_org,
            "owner_workspaces_by_org": owner_workspaces_by_org,
            "user_id": user_id,
        })
        return self._hydrate_workspace_meta(
            items=items,
            member_count_by_workspace=member_count_by_workspace,
            preview_by_workspace=preview_by_workspace,
        )

    async def get_workspace_detail(self, *, organization_id: UUID, workspace_id: UUID) -> WorkspaceDetailOut:
        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        return WorkspaceDetailOut(
            id=ws.id,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            slug=ws.slug,
            name=ws.name,
            icon_url=ws.icon_url,
            icon_asset_aligned=False,
        )

    def _hydrate_workspace_meta(
        self,
        *,
        items: list[MyWorkspaceOut],
        member_count_by_workspace: dict[UUID, int],
        preview_by_workspace: dict[UUID, list[MyWorkspaceMemberPreviewOut]],
    ) -> list[MyWorkspaceOut]:
        for item in items:
            workspace_id = UUID(str(item.workspace_id))
            item.member_count = member_count_by_workspace.get(workspace_id, 0)
            item.members_preview = preview_by_workspace.get(workspace_id, [])
        return items

    async def update_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        payload: WorkspaceUpdateRequest,
        actor_user_id: UUID,
    ) -> WorkspaceDetailOut:
        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        updates: dict[str, object] = {}
        icon_asset_aligned = False
        if payload.name is not None:
            name = str(payload.name).strip()
            if not name:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            if len(name) > 128:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            updates["name"] = name

        if payload.slug is not None:
            desired = str(payload.slug).strip()
            normalized, err = parse_explicit_workspace_slug(desired)
            if err == "invalid" or normalized is None:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="WORKSPACE_SLUG_INVALID")
            if err == "reserved":
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="参数错误"), error="WORKSPACE_SLUG_RESERVED"
                )

            if ws.slug != normalized:
                exists = await Workspace.filter(slug=normalized).exclude(id=ws.id).exists()
                if exists:
                    raise Conflict(
                        message=t("errors", "BAD_REQUEST", default="参数错误"),
                        error="WORKSPACE_SLUG_EXISTS",
                    )
                updates["slug"] = normalized

        if payload.icon_url is not None:
            raw = str(payload.icon_url).strip()
            icon_url = raw or None
            if icon_url is not None and len(icon_url) > 1024:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="参数错误"), error="WORKSPACE_ICON_URL_TOO_LONG"
                )
            updates["icon_url"] = icon_url
            if icon_url is not None:
                asset_uuid = try_extract_asset_uuid_from_relative_public_url(icon_url)
                if asset_uuid is not None:
                    icon_asset_aligned = await align_asset_for_binding(
                        self.settings,
                        scope=AssetScope(type=ASSET_SCOPE_WORKSPACE, id=workspace_id),
                        asset_id=asset_uuid,
                        purpose=AssetPurpose.WORKSPACE_ICON,
                    )

        if updates:
            for k, v in updates.items():
                setattr(ws, k, v)
            try:
                await ws.save(update_fields=list(updates.keys()) + ["updated_at"])
            except IntegrityError as exc:
                raise Conflict(
                    message=t("errors", "BAD_REQUEST", default="参数错误"),
                    error="WORKSPACE_SLUG_EXISTS",
                ) from exc

        return WorkspaceDetailOut(
            id=ws.id,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            slug=ws.slug,
            name=ws.name,
            icon_url=ws.icon_url,
            icon_asset_aligned=icon_asset_aligned,
        )

    async def leave_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        confirm_text: str,
    ) -> LeaveWorkspaceResult:
        if str(confirm_text or "").strip() != "LEAVE":
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="参数错误"),
                error="WORKSPACE_LEAVE_CONFIRM_TEXT_MISMATCH",
            )

        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        membership = await WorkspaceMembership.get_or_none(
            workspace_id=workspace_id,
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        owner_role = await Role.get_or_none(workspace_id=workspace_id, code=ROLE_OWNER)
        if owner_role is not None:
            is_owner_member = await WorkspaceMembership.filter(
                id=membership.id,
                membership_roles__role_id=owner_role.id,
            ).exists()
            if is_owner_member:
                owner_count = await WorkspaceMembership.filter(
                    workspace_id=workspace_id,
                    status=WorkspaceMembershipStatus.ACTIVE,
                    membership_roles__role_id=owner_role.id,
                ).count()
                if int(owner_count) <= 1:
                    raise Forbidden(
                        message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                        error="WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED",
                    )

        membership_id = membership.id
        await membership.delete()

        return LeaveWorkspaceResult(
            workspace_id=workspace_id,
            membership_id=membership_id,
            left=True,
        )
