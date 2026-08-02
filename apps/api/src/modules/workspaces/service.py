from __future__ import annotations

from collections import defaultdict
from typing import Any, cast
from uuid import UUID

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.common.protocols.tortoise import HasOrganizationId, HasUserId, HasWorkspaceId
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, Forbidden, NotFound
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.core.i18n import t
from src.core.services import BaseService
from src.models.assets.asset import AssetPurpose
from src.models.organization.org_membership import OrgRole
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.system.access_restriction import AccessRestrictionEntityType, AccessRestrictionType
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceIconMode,
    WorkspaceMembership,
    WorkspaceMembershipStatus,
)
from src.modules.access_restrictions.repository import AccessRestrictionRepository
from src.modules.access_restrictions.schema import (
    AccessRestrictionEnforceRequest,
    AccessRestrictionLiftRequest,
)
from src.modules.access_restrictions.service import AccessRestrictionAuthority
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.assets.admin.assets.binding_align import align_asset_for_binding
from src.modules.assets.public_url import try_extract_asset_uuid_from_relative_public_url
from src.modules.assets.scope import AssetScope
from src.modules.auth.onboarding.service import WorkspaceFirstOnboardingService
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.organization.workspaces.schema import OrganizationWorkspaceCreateRequest, OrganizationWorkspaceTemplate
from src.modules.organization.workspaces.service import (
    OrganizationWorkspaceService,
    build_organization_workspace_service,
)
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.schema import WorkspacePrimaryProjectOut
from src.modules.system.setup.service import InstanceSetupService
from src.modules.workspaces.membership_lifecycle import WorkspaceMembershipEndParticipant
from src.modules.workspaces.schema import (
    InstanceSetupStateOut,
    LeaveWorkspaceResult,
    MyWorkspaceListResult,
    MyWorkspaceMemberPreviewOut,
    MyWorkspaceOut,
    OnboardingWorkspaceCreateOut,
    OnboardingWorkspaceCreateRequest,
    WorkspaceDeleteResult,
    WorkspaceDetailOut,
    WorkspaceFirstOnboardingOut,
    WorkspaceFirstOnboardingStatus,
    WorkspaceManageArchiveResult,
    WorkspaceManageCreateRequest,
    WorkspaceManageListItemOut,
    WorkspaceManageMemberPreviewOut,
    WorkspaceUpdateRequest,
)


def _resolve_organization_id(value: object) -> UUID:
    return UUID(str(cast(HasOrganizationId, value).organization_id))


def _normalize_workspace_manage_template(value: object) -> OrganizationWorkspaceTemplate:
    return OrganizationWorkspaceTemplate(getattr(value, "value", value))


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


_WORKSPACE_MANAGE_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset({"name", "created_at", "archived_at"})


def _normalize_workspace_ordering(value: str | None) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _WORKSPACE_MANAGE_ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields


def _normalize_sort_value(value: Any) -> tuple[int, Any]:
    if value is None:
        return (1, "")
    if isinstance(value, str):
        return (0, value.lower())
    return (0, value)


def _build_member_workspace_list(*, workspaces: list[Workspace], user_id: UUID) -> list[MyWorkspaceOut]:
    """
    Build the Product Application workspace list from explicit active memberships.
    """

    out: list[MyWorkspaceOut] = []
    for ws in workspaces:
        out.append(
            MyWorkspaceOut(
                id=ws.id,
                workspace_id=ws.id,
                project_id=None,
                name=ws.name,
                description=ws.description,
                icon_mode=ws.icon_mode,
                icon_color=ws.icon_color,
                icon_glyph=ws.icon_glyph,
                icon_emoji=ws.icon_emoji,
                icon_url=ws.icon_url,
                member_count=0,
                members_preview=[],
                created_at=ws.created_at,
                is_owner=UUID(str(ws.owner_user_id)) == user_id,
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
    def __init__(
        self,
        settings: Settings,
        *,
        repo: OrganizationWorkspaceRepository | None = None,
        org_repo: OrganizationRepository | None = None,
        project_repo: ProjectRepository | None = None,
        instance_setup_service: InstanceSetupService | None = None,
        onboarding_service: WorkspaceFirstOnboardingService | None = None,
        organization_workspace_service: OrganizationWorkspaceService | None = None,
        restriction_authority: AccessRestrictionAuthority | None = None,
        membership_end_participant: WorkspaceMembershipEndParticipant | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = repo or OrganizationWorkspaceRepository()
        self.org_repo = org_repo or OrganizationRepository()
        self.project_repo = project_repo or ProjectRepository()
        self.instance_setup_service = instance_setup_service or InstanceSetupService(settings)
        self.onboarding_service = onboarding_service or WorkspaceFirstOnboardingService(settings)
        self.organization_workspace_service = (
            organization_workspace_service or build_organization_workspace_service(settings)
        )
        self.restriction_authority = restriction_authority or AccessRestrictionAuthority(AccessRestrictionRepository())
        self.membership_end_participant = membership_end_participant

    async def _write_workspace_activity_event(
        self,
        *,
        event_name: str,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        properties: JsonObject,
        conn,
    ) -> None:
        payload: JsonObject = {
            "organization_id": str(organization_id),
            "workspace_id": str(workspace_id),
            "actor_user_id": str(actor_user_id),
        }
        payload.update(properties)
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="workspace",
                entity_id=workspace_id,
                source="api",
                properties=payload,
            ),
            conn=conn,
        )

    async def list_my_workspaces(self, *, user_id: UUID) -> MyWorkspaceListResult:
        """
        List workspaces visible to the current user.

        Product visibility comes only from an active Workspace membership. Organization
        governance is not a second Workspace entry authority.
        """
        memberships = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__is_active=True,
        ).all()
        membership_workspace_ids = [
            UUID(str(cast(HasWorkspaceId, membership).workspace_id)) for membership in memberships
        ]
        membership_workspaces = await self.repo.list_active_by_ids(workspace_ids=membership_workspace_ids)
        active_memberships = await WorkspaceMembership.filter(
            workspace_id__in=membership_workspace_ids,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).all()
        users = await self.repo.list_users(user_ids=self._membership_user_ids(active_memberships))
        member_count_by_workspace, preview_by_workspace = await _build_workspace_member_meta(
            workspaces=membership_workspaces,
            memberships=active_memberships,
            users=users,
        )
        project_id_by_workspace = await self.project_repo.get_primary_project_ids_by_workspace_ids(
            workspace_ids=membership_workspace_ids,
        )
        items = _build_member_workspace_list(workspaces=membership_workspaces, user_id=user_id)
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

    def _map_manage_member_preview(
        self, members_preview: list[MyWorkspaceMemberPreviewOut]
    ) -> list[WorkspaceManageMemberPreviewOut]:
        return [
            WorkspaceManageMemberPreviewOut(
                user_id=member.user_id,
                username=member.username,
                display_name=member.display_name,
                avatar_url=member.avatar_url,
            )
            for member in members_preview
        ]

    def _map_manage_list_item(self, item: MyWorkspaceOut) -> WorkspaceManageListItemOut:
        created_at = item.created_at
        if created_at is None:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_CREATED_AT_REQUIRED")
        return WorkspaceManageListItemOut(
            id=item.id,
            workspace_id=item.workspace_id,
            project_id=item.project_id,
            name=item.name,
            description=item.description,
            icon_mode=item.icon_mode,
            icon_color=item.icon_color,
            icon_glyph=item.icon_glyph,
            icon_emoji=item.icon_emoji,
            icon_url=item.icon_url,
            is_archived=False,
            archived_at=None,
            archived_by_user_id=None,
            member_count=item.member_count,
            members_preview=self._map_manage_member_preview(item.members_preview),
            created_at=created_at,
            enterable=True,
            project=WorkspacePrimaryProjectOut(project_id=item.project_id) if item.project_id is not None else None,
        )

    async def list_manage_workspaces(
        self,
        *,
        user_id: UUID,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        archived: bool | None,
        enterable_only: bool,
    ) -> PageData[WorkspaceManageListItemOut]:
        result = await self.list_my_workspaces(user_id=user_id)
        workspace_ids = [UUID(str(item.workspace_id)) for item in result.items]
        visible_workspaces = await self.repo.list_non_deleted_by_ids(workspace_ids=workspace_ids)
        workspace_by_id = {UUID(str(workspace.id)): workspace for workspace in visible_workspaces}
        archive_restrictions = await self.restriction_authority.list_current(
            entity_type=AccessRestrictionEntityType.WORKSPACE,
            entity_ids=workspace_ids,
            restriction_types=[AccessRestrictionType.WORKSPACE_ARCHIVED],
        )
        archive_revision_by_workspace_id = {
            UUID(str(restriction.entity_id)): int(restriction.revision) for restriction in archive_restrictions
        }

        items: list[WorkspaceManageListItemOut] = []
        for item in result.items:
            workspace = workspace_by_id.get(UUID(str(item.workspace_id)))
            if workspace is None:
                continue
            manage_item = self._map_manage_workspace_out(item)
            created_at = item.created_at
            if created_at is None:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_CREATED_AT_REQUIRED")
            manage_item.is_archived = workspace.archived_at is not None
            manage_item.archived_at = workspace.archived_at
            manage_item.archived_by_user_id = workspace.archived_by_user_id
            manage_item.archive_revision = archive_revision_by_workspace_id.get(
                UUID(str(workspace.id)),
                0,
            )
            if archived is True and not manage_item.is_archived:
                continue
            if archived is False and manage_item.is_archived:
                continue
            if enterable_only and not manage_item.enterable:
                continue
            if q:
                needle = str(q).strip().lower()
                if (
                    needle
                    and needle not in str(manage_item.name or "").lower()
                    and needle not in str(manage_item.description or "").lower()
                ):
                    continue
            manage_item.created_at = created_at
            items.append(manage_item)

        normalized_ordering = _normalize_workspace_ordering(ordering)
        if normalized_ordering:
            items = self._sort_manage_workspaces(rows=items, ordering=normalized_ordering)
        else:
            items = self._sort_manage_workspaces_default(rows=items, archived=archived)

        return paginate_items(items, params=params)

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

        organization = await self._ensure_onboarding_organization(
            user_id=user_id,
            organization_name=workspace_name,
        )
        created_workspace = await self.organization_workspace_service.create_workspace(
            organization_id=UUID(str(organization.id)),
            user_id=user_id,
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

    async def create_manage_workspace(
        self,
        *,
        user_id: UUID,
        payload: WorkspaceManageCreateRequest,
    ) -> WorkspaceManageListItemOut:
        workspace_name = str(payload.name or "").strip()
        if not workspace_name:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_WORKSPACE_NAME")

        organization = await self._ensure_onboarding_organization(
            user_id=user_id,
            organization_name=workspace_name,
        )
        created_workspace = await self.organization_workspace_service.create_workspace(
            organization_id=UUID(str(organization.id)),
            user_id=user_id,
            payload=OrganizationWorkspaceCreateRequest(
                name=workspace_name,
                description=payload.description,
                template=_normalize_workspace_manage_template(payload.template),
                locale=payload.locale,
                timezone=payload.timezone,
                date_format=payload.date_format,
            ),
        )
        return self._map_manage_workspace_out(created_workspace)

    async def get_workspace_detail(self, *, organization_id: UUID, workspace_id: UUID) -> WorkspaceDetailOut:
        ws = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        project = await self.project_repo.get_first_project_by_workspace_id(workspace_id=workspace_id)
        return WorkspaceDetailOut(
            id=ws.id,
            project=WorkspacePrimaryProjectOut(project_id=UUID(str(project.id))) if project is not None else None,
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
            instance_setup=InstanceSetupStateOut(
                status=setup_state.status,
                repair_reason=setup_state.repair_reason,
            ),
            onboarding=WorkspaceFirstOnboardingOut(
                status=WorkspaceFirstOnboardingStatus(onboarding_state.status.value),
                workspace_id=onboarding_state.workspace_id,
            ),
        )

    async def _ensure_onboarding_organization(
        self,
        *,
        user_id: UUID,
        organization_name: str,
    ) -> Organization:
        organization = await self.org_repo.get_onboarding_organization(owner_user_id=user_id)
        if organization is None:
            organization = await self.org_repo.create_organization(
                slug=f"org-{user_id.hex[:12]}",
                name=organization_name,
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
                        scope=AssetScope(type=ASSET_SCOPE_WORKSPACE, id=workspace_id),
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
            async with self.tx() as conn:
                for k, v in updates.items():
                    setattr(ws, k, v)
                await ws.save(update_fields=list(updates.keys()) + ["updated_at"], using_db=conn)
                await self._write_workspace_activity_event(
                    event_name="workspace.updated",
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    properties={"updated_fields": sorted(updates.keys())},
                    conn=conn,
                )

        return WorkspaceDetailOut(
            id=ws.id,
            name=ws.name,
            description=ws.description,
            icon_mode=ws.icon_mode,
            icon_color=ws.icon_color,
            icon_glyph=ws.icon_glyph,
            icon_emoji=ws.icon_emoji,
            icon_url=ws.icon_url,
            icon_asset_aligned=icon_asset_aligned,
        )

    async def archive_manage_workspace(
        self,
        *,
        user_id: UUID,
        workspace_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionEnforceRequest,
    ) -> WorkspaceManageArchiveResult:
        organization_id = await self._get_workspace_organization_id(workspace_id=workspace_id)
        out = await self.organization_workspace_service.archive_workspace(
            organization_id=organization_id,
            workspace_id=workspace_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            payload=payload,
        )
        return WorkspaceManageArchiveResult(
            workspace_id=UUID(str(out.workspace_id)),
            is_archived=out.is_archived,
            archived_at=out.archived_at,
            archived_by_user_id=out.archived_by_user_id,
        )

    async def require_workspace_lifecycle_owner(
        self,
        *,
        workspace_id: UUID,
        user_id: UUID,
    ) -> None:
        workspace = await Workspace.get_or_none(id=workspace_id, deleted_at__isnull=True)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        if UUID(str(workspace.owner_user_id)) != user_id:
            raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="WORKSPACE_OWNER_REQUIRED")

    async def unarchive_manage_workspace(
        self,
        *,
        user_id: UUID,
        workspace_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionLiftRequest,
    ) -> WorkspaceManageArchiveResult:
        organization_id = await self._get_workspace_organization_id(workspace_id=workspace_id)
        out = await self.organization_workspace_service.unarchive_workspace(
            organization_id=organization_id,
            workspace_id=workspace_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            payload=payload,
        )
        return WorkspaceManageArchiveResult(
            workspace_id=UUID(str(out.workspace_id)),
            is_archived=out.is_archived,
            archived_at=out.archived_at,
            archived_by_user_id=out.archived_by_user_id,
        )

    async def delete_manage_workspace(
        self,
        *,
        user_id: UUID,
        workspace_id: UUID,
        confirm_name: str,
    ) -> WorkspaceDeleteResult:
        organization_id = await self._get_workspace_organization_id(workspace_id=workspace_id)
        out = await self.organization_workspace_service.delete_workspace(
            organization_id=organization_id,
            workspace_id=workspace_id,
            user_id=user_id,
            confirm_name=confirm_name,
        )
        return WorkspaceDeleteResult(workspace_id=UUID(str(out.workspace_id)), deleted=out.deleted)

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

        if self.membership_end_participant is None:
            raise RuntimeError("Workspace membership lifecycle participant is required")

        async with self.tx() as conn:
            workspace = await (
                Workspace
                .filter(
                    id=workspace_id,
                    organization_id=organization_id,
                    is_active=True,
                    deleted_at__isnull=True,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if workspace is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
            membership = await (
                WorkspaceMembership
                .filter(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    status=WorkspaceMembershipStatus.ACTIVE,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if membership is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
            if UUID(str(workspace.owner_user_id)) == user_id:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED"),
                    error="WORKSPACE_OWNER_TRANSFER_REQUIRED",
                )

            membership_id = membership.id
            await self.membership_end_participant.release_for_membership_end(
                workspace_id=workspace_id,
                membership_id=membership_id,
                lifecycle_idempotency_key=(
                    f"workspace-membership:{membership.id}:leave:{membership.updated_at.isoformat()}"
                ),
                conn=conn,
            )
            await membership.delete(using_db=conn)

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

    async def _get_workspace_organization_id(self, *, workspace_id: UUID) -> UUID:
        workspace = await self.repo.get_active_workspace_by_id(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        return _resolve_organization_id(workspace)

    def _map_manage_workspace_out(self, workspace: Any):
        created_at = workspace.created_at
        if created_at is None:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_CREATED_AT_REQUIRED")
        return WorkspaceManageListItemOut(
            id=workspace.id,
            workspace_id=workspace.workspace_id,
            project_id=workspace.project_id,
            name=workspace.name,
            description=workspace.description,
            icon_mode=workspace.icon_mode,
            icon_color=workspace.icon_color,
            icon_glyph=workspace.icon_glyph,
            icon_emoji=workspace.icon_emoji,
            icon_url=workspace.icon_url,
            is_archived=getattr(workspace, "is_archived", False),
            archived_at=getattr(workspace, "archived_at", None),
            archived_by_user_id=getattr(workspace, "archived_by_user_id", None),
            member_count=getattr(workspace, "member_count", 0),
            members_preview=self._map_manage_member_preview(
                getattr(workspace, "members_preview", [])
                if isinstance(getattr(workspace, "members_preview", []), list)
                else []
            ),
            created_at=created_at,
            enterable=getattr(workspace, "enterable", True),
            project=workspace.project,
        )

    def _sort_manage_workspaces_default(
        self,
        *,
        rows: list[WorkspaceManageListItemOut],
        archived: bool | None,
    ) -> list[WorkspaceManageListItemOut]:
        if archived is True:
            return sorted(rows, key=lambda ws: ws.created_at)
        if archived is False:
            return sorted(rows, key=lambda ws: ws.created_at)
        return sorted(rows, key=lambda ws: (ws.is_archived, ws.created_at))

    def _sort_manage_workspaces(
        self,
        *,
        rows: list[WorkspaceManageListItemOut],
        ordering: list[str],
    ) -> list[WorkspaceManageListItemOut]:
        out = list(rows)
        for raw in reversed(ordering):
            desc = raw.startswith("-")
            name = raw[1:] if desc else raw
            out.sort(
                key=lambda ws, field=name: self._workspace_manage_sort_key(workspace=ws, field=field),
                reverse=desc,
            )
        return out

    def _workspace_manage_sort_key(self, *, workspace: WorkspaceManageListItemOut, field: str) -> tuple[int, Any]:
        if field == "name":
            return _normalize_sort_value(workspace.name)
        if field == "archived_at":
            return _normalize_sort_value(workspace.archived_at)
        return _normalize_sort_value(workspace.created_at)
