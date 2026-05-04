from __future__ import annotations

from collections import defaultdict
from typing import TypedDict, cast
from uuid import UUID

from src.common.constants.assets import ASSET_SCOPE_ORGANIZATION
from src.common.protocols.tortoise import HasOrganizationId, HasUserId, HasWorkspaceId
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, Forbidden, NotFound
from src.core.i18n import t
from src.models.assets.asset import AssetPurpose
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User
from src.models.system.rbac import Role
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceIconMode,
    WorkspaceMembership,
    WorkspaceMembershipStatus,
)
from src.modules.assets.admin.assets.binding_align import align_asset_for_binding
from src.modules.assets.public_url import try_extract_asset_uuid_from_relative_public_url
from src.modules.assets.scope import AssetScope
from src.modules.auth.onboarding.service import WorkspaceFirstOnboardingService
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest, OrganizationWorkspaceTemplate
from src.modules.organization.workspaces.service import OrganizationWorkspaceService
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.schema import WorkspacePrimaryProjectOut
from src.modules.system.rbac.constants.service import ROLE_OWNER
from src.modules.system.setup.service import InstanceSetupService
from src.modules.workspaces.schema import (
    InstanceSetupStateOut,
    LeaveWorkspaceResult,
    MyWorkspaceListResult,
    MyWorkspaceMemberPreviewOut,
    MyWorkspaceOut,
    OnboardingWorkspaceCreateOut,
    OnboardingWorkspaceCreateRequest,
    WorkspaceDetailOut,
    WorkspaceFirstOnboardingOut,
    WorkspaceFirstOnboardingStatus,
    WorkspaceSwitcherOut,
    WorkspaceUpdateRequest,
)


def _resolve_organization_id(value: object) -> UUID:
    return UUID(str(cast(HasOrganizationId, value).organization_id))


def _normalize_workspace_icon_color(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized:
        raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ICON_COLOR_INVALID")
    if len(normalized) == 4 and normalized.startswith("#"):
        normalized = "#" + "".join(char * 2 for char in normalized[1:])
    if len(normalized) != 7 or not normalized.startswith("#"):
        raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ICON_COLOR_INVALID")
    if any(char not in "0123456789abcdef" for char in normalized[1:]):
        raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ICON_COLOR_INVALID")
    return normalized


def _normalize_optional_workspace_icon_value(
    value: str | None,
    *,
    max_length: int,
    error_code: str,
) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    if len(normalized) > max_length:
        raise BadRequest(message=t("errors", "BAD_REQUEST"), error=error_code)
    return normalized


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
                project_id=None,
                organization_id=_resolve_organization_id(ws),
                name=ws.name,
                kind=ws.kind,
                description=ws.description,
                icon_mode=ws.icon_mode,
                icon_color=ws.icon_color,
                icon_glyph=ws.icon_glyph,
                icon_emoji=ws.icon_emoji,
                icon_url=ws.icon_url,
                member_count=0,
                members_preview=[],
                created_at=ws.created_at,
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
                    project_id=None,
                    organization_id=org_id,
                    name=ws.name,
                    kind=ws.kind,
                    description=ws.description,
                    icon_mode=ws.icon_mode,
                    icon_color=ws.icon_color,
                    icon_glyph=ws.icon_glyph,
                    icon_emoji=ws.icon_emoji,
                    icon_url=ws.icon_url,
                    member_count=0,
                    members_preview=[],
                    created_at=ws.created_at,
                    visible_only=visible_only,
                    is_creator_admin=is_creator_admin,
                )
            )
    return out


async def _build_workspace_member_meta(
    *,
    workspaces: list[Workspace],
    memberships: list[WorkspaceMembership],
    users: list[User],
) -> tuple[dict[UUID, int], dict[UUID, list[MyWorkspaceMemberPreviewOut]]]:
    member_ids_by_workspace: dict[UUID, list[UUID]] = defaultdict(list)
    for membership in memberships:
        workspace_id = UUID(str(cast(HasWorkspaceId, membership).workspace_id))
        user_id = cast(HasUserId, membership).user_id
        if user_id is None:
            continue
        member_ids_by_workspace[workspace_id].append(UUID(str(user_id)))

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
        self.repo = OrganizationWorkspaceRepository()
        self.org_repo = OrganizationRepository()
        self.project_repo = ProjectRepository()
        self.instance_setup_service = InstanceSetupService(settings)
        self.onboarding_service = WorkspaceFirstOnboardingService(settings)

    async def list_my_workspaces(self, *, user_id: UUID) -> MyWorkspaceListResult:
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
        membership_workspaces = await self.repo.list_active_by_ids(workspace_ids=membership_workspace_ids)

        if not orgms:
            users = await self.repo.list_users(user_ids=self._membership_user_ids(memberships))
            member_count_by_workspace, preview_by_workspace = await _build_workspace_member_meta(
                workspaces=membership_workspaces,
                memberships=memberships,
                users=users,
            )
            project_id_by_workspace = await self.project_repo.get_primary_project_ids_by_workspace_ids(
                workspace_ids=membership_workspace_ids,
            )
            items = _build_guest_workspace_list(workspaces=membership_workspaces)
            items = self._hydrate_workspace_meta(
                items=items,
                member_count_by_workspace=member_count_by_workspace,
                preview_by_workspace=preview_by_workspace,
                project_id_by_workspace=project_id_by_workspace,
            )
            return await self._build_workspace_list_result(
                user_id=user_id,
                items=items,
            )

        org_roles, org_order = _collect_org_roles(orgms)
        membership_workspaces_by_org = _group_workspaces_by_org(membership_workspaces)

        owner_org_ids = [org_id for org_id in org_order if org_roles.get(org_id) == OrgRole.OWNER]
        owner_workspaces = await self.repo.list_active_by_organization_ids(organization_ids=owner_org_ids)
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
        users = await self.repo.list_users(user_ids=self._membership_user_ids(active_memberships))
        member_count_by_workspace, preview_by_workspace = await _build_workspace_member_meta(
            workspaces=list(visible_workspaces_by_id.values()),
            memberships=active_memberships,
            users=users,
        )
        project_id_by_workspace = await self.project_repo.get_primary_project_ids_by_workspace_ids(
            workspace_ids=visible_workspace_ids,
        )

        items = _build_member_workspace_list({
            "org_order": org_order,
            "org_roles": org_roles,
            "membership_by_workspace_id": membership_by_workspace_id,
            "membership_workspaces_by_org": membership_workspaces_by_org,
            "owner_workspaces_by_org": owner_workspaces_by_org,
            "user_id": user_id,
        })
        items = self._hydrate_workspace_meta(
            items=items,
            member_count_by_workspace=member_count_by_workspace,
            preview_by_workspace=preview_by_workspace,
            project_id_by_workspace=project_id_by_workspace,
        )
        return await self._build_workspace_list_result(
            user_id=user_id,
            items=items,
        )

    async def create_onboarding_workspace(
        self,
        *,
        user_id: UUID,
        payload: OnboardingWorkspaceCreateRequest,
    ) -> OnboardingWorkspaceCreateOut:
        onboarding_state = await self.onboarding_service.get_state(user_id=user_id)
        if onboarding_state.status == WorkspaceFirstOnboardingStatus.COMPLETED:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ONBOARDING_COMPLETED")
        if onboarding_state.status == WorkspaceFirstOnboardingStatus.PENDING_WORKSPACE_DEFAULTS:
            if onboarding_state.workspace_id is None:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST"),
                    error="WORKSPACE_ONBOARDING_STATE_INVALID",
                )
            existing_workspace = await self.repo.get_active_workspace_by_id(workspace_id=onboarding_state.workspace_id)
            if existing_workspace is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
            return OnboardingWorkspaceCreateOut(
                workspace_id=UUID(str(existing_workspace.id)),
            )

        workspace_name = str(payload.name or "").strip()
        if not workspace_name:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_WORKSPACE_NAME")

        organization = await self._ensure_onboarding_team_organization(
            user_id=user_id,
            organization_name=workspace_name,
        )
        created_workspace = await OrganizationWorkspaceService(self.settings).create_workspace(
            organization_id=UUID(str(organization.id)),
            user_id=user_id,
            org_role=OrgRole.OWNER,
            payload=OrganizationWorkspaceCreateRequest(
                name=workspace_name,
                template=OrganizationWorkspaceTemplate.BLANK,
            ),
        )
        await self.onboarding_service.mark_workspace_created(
            user_id=user_id,
            workspace_id=UUID(str(created_workspace.workspace_id)),
        )
        return OnboardingWorkspaceCreateOut(
            workspace_id=UUID(str(created_workspace.workspace_id)),
        )

    async def get_workspace_detail(self, *, organization_id: UUID, workspace_id: UUID) -> WorkspaceDetailOut:
        ws = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        project = await self.project_repo.get_first_project_by_workspace_id(workspace_id=workspace_id)
        return WorkspaceDetailOut(
            id=ws.id,
            project=WorkspacePrimaryProjectOut(project_id=UUID(str(project.id))) if project is not None else None,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            kind=ws.kind,
            name=ws.name,
            description=ws.description,
            icon_mode=ws.icon_mode,
            icon_color=ws.icon_color,
            icon_glyph=ws.icon_glyph,
            icon_emoji=ws.icon_emoji,
            icon_url=ws.icon_url,
            icon_asset_aligned=False,
        )

    def _hydrate_workspace_meta(
        self,
        *,
        items: list[MyWorkspaceOut],
        member_count_by_workspace: dict[UUID, int],
        preview_by_workspace: dict[UUID, list[MyWorkspaceMemberPreviewOut]],
        project_id_by_workspace: dict[UUID, UUID],
    ) -> list[MyWorkspaceOut]:
        for item in items:
            workspace_id = UUID(str(item.workspace_id))
            item.member_count = member_count_by_workspace.get(workspace_id, 0)
            item.members_preview = preview_by_workspace.get(workspace_id, [])
            project_id = project_id_by_workspace.get(workspace_id)
            if project_id is not None:
                item.project_id = project_id
        return items

    async def _build_workspace_list_result(
        self,
        *,
        user_id: UUID,
        items: list[MyWorkspaceOut],
    ) -> MyWorkspaceListResult:
        setup_state = await self.instance_setup_service.get_state()
        onboarding_state = await self.onboarding_service.get_state(user_id=user_id)

        return MyWorkspaceListResult(
            items=items,
            switcher=WorkspaceSwitcherOut(teams=items),
            instance_setup=InstanceSetupStateOut(
                status=setup_state.status,
                repair_reason=setup_state.repair_reason,
            ),
            onboarding=WorkspaceFirstOnboardingOut(
                status=WorkspaceFirstOnboardingStatus(onboarding_state.status.value),
                workspace_id=onboarding_state.workspace_id,
            ),
        )

    async def _ensure_onboarding_team_organization(
        self,
        *,
        user_id: UUID,
        organization_name: str,
    ) -> Organization:
        organization = await self.org_repo.get_onboarding_team_organization(owner_user_id=user_id)
        if organization is None:
            organization = await self.org_repo.create_organization(
                slug=f"team-org-{user_id.hex[:12]}",
                name=organization_name,
                kind=OrganizationKind.TEAM,
                owner_user_id=user_id,
            )
        else:
            update_fields: list[str] = []
            if organization.deleted_at is not None:
                organization.deleted_at = None
                update_fields.append("deleted_at")
            if not organization.is_active:
                organization.is_active = True
                update_fields.append("is_active")
            if update_fields:
                await organization.save(update_fields=[*update_fields, "updated_at"])
        await self.org_repo.ensure_org_membership(
            user_id=user_id,
            organization_id=UUID(str(organization.id)),
            role=OrgRole.OWNER,
        )
        return organization

    async def update_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        payload: WorkspaceUpdateRequest,
        actor_user_id: UUID,
    ) -> WorkspaceDetailOut:
        ws = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        updates: dict[str, object] = {}
        icon_asset_aligned = False
        if payload.name is not None:
            name = str(payload.name).strip()
            if not name:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_WORKSPACE_NAME")
            if len(name) > 128:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_WORKSPACE_NAME")
            updates["name"] = name

        if payload.description is not None:
            description = str(payload.description).strip() or None
            if description is not None and len(description) > 256:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST"),
                    error="INVALID_WORKSPACE_DESCRIPTION",
                )
            updates["description"] = description

        if payload.icon_url is not None:
            raw = str(payload.icon_url).strip()
            icon_url = raw or None
            if icon_url is not None and len(icon_url) > 1024:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ICON_URL_TOO_LONG")
            updates["icon_url"] = icon_url
            if icon_url is not None:
                asset_uuid = try_extract_asset_uuid_from_relative_public_url(icon_url)
                if asset_uuid is not None:
                    icon_asset_aligned = await align_asset_for_binding(
                        self.settings,
                        scope=AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=organization_id),
                        asset_id=asset_uuid,
                        purpose=AssetPurpose.WORKSPACE_ICON,
                    )

        if payload.icon_mode is not None:
            updates["icon_mode"] = payload.icon_mode

        if payload.icon_color is not None:
            updates["icon_color"] = _normalize_workspace_icon_color(payload.icon_color)

        if payload.icon_glyph is not None:
            updates["icon_glyph"] = _normalize_optional_workspace_icon_value(
                payload.icon_glyph,
                max_length=64,
                error_code="WORKSPACE_ICON_GLYPH_INVALID",
            )

        if payload.icon_emoji is not None:
            updates["icon_emoji"] = _normalize_optional_workspace_icon_value(
                payload.icon_emoji,
                max_length=32,
                error_code="WORKSPACE_ICON_EMOJI_INVALID",
            )

        next_icon_mode = cast(WorkspaceIconMode, updates.get("icon_mode", ws.icon_mode))
        next_icon_glyph = cast(str | None, updates.get("icon_glyph", ws.icon_glyph))
        next_icon_emoji = cast(str | None, updates.get("icon_emoji", ws.icon_emoji))
        if next_icon_mode == WorkspaceIconMode.GLYPH and not next_icon_glyph:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ICON_GLYPH_REQUIRED")
        if next_icon_mode == WorkspaceIconMode.EMOJI and not next_icon_emoji:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ICON_EMOJI_REQUIRED")
        if next_icon_mode == WorkspaceIconMode.IMAGE:
            next_icon_url = cast(str | None, updates.get("icon_url", ws.icon_url))
            if not next_icon_url:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_ICON_URL_REQUIRED")

        if updates:
            for k, v in updates.items():
                setattr(ws, k, v)
            await ws.save(update_fields=list(updates.keys()) + ["updated_at"])

        return WorkspaceDetailOut(
            id=ws.id,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            kind=ws.kind,
            name=ws.name,
            description=ws.description,
            icon_mode=ws.icon_mode,
            icon_color=ws.icon_color,
            icon_glyph=ws.icon_glyph,
            icon_emoji=ws.icon_emoji,
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
                message=t("errors", "BAD_REQUEST"),
                error="WORKSPACE_LEAVE_CONFIRM_TEXT_MISMATCH",
            )

        ws = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        membership = await WorkspaceMembership.get_or_none(
            workspace_id=workspace_id,
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

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
                        message=t("errors", "PERMISSION_DENIED"),
                        error="WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED",
                    )

        membership_id = membership.id
        await membership.delete()

        return LeaveWorkspaceResult(
            workspace_id=workspace_id,
            membership_id=membership_id,
            left=True,
        )

    @staticmethod
    def _membership_user_ids(memberships: list[WorkspaceMembership]) -> list[UUID]:
        return [
            UUID(str(user_id))
            for membership in memberships
            if (user_id := cast(HasUserId, membership).user_id) is not None
        ]
