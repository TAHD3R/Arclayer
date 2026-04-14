from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from math import ceil
from typing import Any, cast
from uuid import UUID

from src.common.protocols.tortoise import HasUserId, HasWorkspaceId, WorkspaceArchiveMutableFields
from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.core.i18n import t
from src.models.organization.org_membership import OrgRole
from src.models.organization.user import User
from src.models.system.rbac import Role
from src.models.workspaces.workspace import Workspace, WorkspaceMembershipRole
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.organization.workspaces.schema import (
    OrganizationWorkspaceArchiveResult,
    OrganizationWorkspaceCreateRequest,
    OrganizationWorkspaceDeleteResult,
    OrganizationWorkspaceMemberOut,
    OrganizationWorkspaceMemberPreviewOut,
    OrganizationWorkspaceOut,
    OrganizationWorkspaceSlugAvailabilityOut,
)
from src.modules.system.rbac.constants.service import ROLE_ADMIN, ROLE_OWNER
from src.modules.system.rbac.service import RBACService
from src.modules.workspaces.policy.service import OrgWorkspaceCreationPolicy
from src.modules.workspaces.settings.service import WorkspaceSettingsService
from src.modules.workspaces.site.service import WorkspaceSiteService
from src.modules.workspaces.slug.service import next_available_workspace_slug, parse_explicit_workspace_slug

_ORG_WORKSPACE_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset({"name", "slug", "created_at", "archived_at"})
MAX_WORKSPACE_NAME_LENGTH = 128


def _normalize_workspace_ordering(value: str | None) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _ORG_WORKSPACE_ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields


class OrganizationWorkspaceService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationWorkspaceRepository()
        self.site_service = WorkspaceSiteService(settings)
        self.creation_policy = OrgWorkspaceCreationPolicy(settings)

    async def list_workspaces(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        archived: bool | None,
        enterable_only: bool,
    ) -> PageData[OrganizationWorkspaceOut]:
        if org_role in (OrgRole.OWNER, OrgRole.ADMIN):
            rows = await self.repo.list_active_workspaces_for_org(organization_id=organization_id)
        else:
            rows = await self.repo.list_active_workspaces_for_member(
                organization_id=organization_id,
                user_id=user_id,
            )

        needle = str(q or "").strip().lower()
        if needle:
            rows = [
                ws
                for ws in rows
                if needle in str(ws.name or "").lower()
                or needle in str(ws.slug or "").lower()
                or needle in str(ws.description or "").lower()
            ]

        if archived is True:
            rows = [ws for ws in rows if ws.archived_at is not None]
        elif archived is False:
            rows = [ws for ws in rows if ws.archived_at is None]

        normalized_ordering = _normalize_workspace_ordering(ordering)
        if normalized_ordering:
            rows = self._sort_workspaces(rows=rows, ordering=normalized_ordering)
        else:
            rows = self._sort_workspaces_default(rows=rows, archived=archived)

        workspace_ids = [UUID(str(ws.id)) for ws in rows]
        memberships = await self.repo.list_active_memberships(workspace_ids=workspace_ids)

        members_by_workspace: dict[UUID, list[UUID]] = defaultdict(list)
        viewer_membership_workspace_ids: set[UUID] = set()
        for membership in memberships:
            ws_id = UUID(str(cast(HasWorkspaceId, membership).workspace_id))
            user_id_value = cast(HasUserId, membership).user_id
            if user_id_value is not None:
                member_user_id = UUID(str(user_id_value))
                members_by_workspace[ws_id].append(member_user_id)
                if member_user_id == user_id:
                    viewer_membership_workspace_ids.add(ws_id)

        unique_user_ids = list({uid for ids in members_by_workspace.values() for uid in ids})
        users = await self.repo.list_users(user_ids=unique_user_ids)
        user_by_id = {UUID(str(u.id)): u for u in users}

        out_items: list[OrganizationWorkspaceOut] = []
        for ws in rows:
            ws_id = UUID(str(ws.id))
            is_creator_admin = bool(org_role == OrgRole.OWNER and UUID(str(ws.created_by_user_id)) == user_id)
            enterable = ws_id in viewer_membership_workspace_ids or is_creator_admin
            if enterable_only and not enterable:
                continue

            member_ids = members_by_workspace.get(ws_id, [])
            preview: list[OrganizationWorkspaceMemberPreviewOut] = []
            for uid in member_ids[:5]:
                user = user_by_id.get(uid)
                if user is None:
                    continue
                preview.append(
                    OrganizationWorkspaceMemberPreviewOut(
                        user_id=user.id,
                        username=user.username,
                        display_name=user.display_name,
                        email=user.email,
                        avatar_url=user.avatar_url,
                    )
                )

            out_items.append(
                self._build_workspace_out(
                    organization_id=organization_id,
                    workspace=ws,
                    member_count=len(member_ids),
                    members_preview=preview,
                    enterable=enterable,
                )
            )

        return paginate_items(out_items, params=params)

    async def list_workspace_members(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
        params: PageParams,
        q: str | None,
    ) -> PageData[OrganizationWorkspaceMemberOut]:
        if org_role in (OrgRole.OWNER, OrgRole.ADMIN):
            workspace = await self.repo.get_active_workspace(
                organization_id=organization_id,
                workspace_id=workspace_id,
            )
            if workspace is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        else:
            visible = await self.repo.list_active_workspaces_for_member(
                organization_id=organization_id,
                user_id=user_id,
            )
            visible_ids = {UUID(str(item.id)) for item in visible}
            if workspace_id not in visible_ids:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        total, rows = await self.repo.list_workspace_members(
            workspace_id=workspace_id,
            q=q,
            offset=params.offset,
            limit=params.limit,
        )

        items: list[OrganizationWorkspaceMemberOut] = []
        for membership in rows:
            user_ref = cast(User | None, getattr(membership, "user", None))
            if user_ref is None:
                continue
            items.append(
                OrganizationWorkspaceMemberOut(
                    membership_id=membership.id,
                    user_id=user_ref.id,
                    username=user_ref.username,
                    display_name=user_ref.display_name,
                    email=user_ref.email,
                    avatar_url=user_ref.avatar_url,
                    joined_at=membership.created_at,
                )
            )

        pages = ceil(total / params.size) if params.size else 0
        next_page: int | None = None
        prev_page: int | None = None
        if pages > 0:
            if params.page < pages:
                next_page = params.page + 1
            if params.page > 1:
                prev_page = min(params.page - 1, pages)

        return PageData[OrganizationWorkspaceMemberOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def create_workspace(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
        payload: OrganizationWorkspaceCreateRequest,
    ) -> OrganizationWorkspaceOut:
        name = str(payload.name or "").strip()
        if not name:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_WORKSPACE_NAME")
        if len(name) > MAX_WORKSPACE_NAME_LENGTH:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_NAME_TOO_LONG")

        description = str(payload.description or "").strip() or None

        await self.creation_policy.assert_can_create(organization_id=organization_id)

        requested_slug = str(payload.slug or "").strip()
        if requested_slug:
            normalized_slug, err = parse_explicit_workspace_slug(requested_slug)
            if err == "invalid" or normalized_slug is None:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="WORKSPACE_SLUG_INVALID")
            if err == "reserved":
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="参数错误"),
                    error="WORKSPACE_SLUG_RESERVED",
                )
            if await self.repo.slug_exists(slug=normalized_slug):
                raise Conflict(
                    message=t("errors", "CONFLICT", default="资源冲突"),
                    error="WORKSPACE_SLUG_EXISTS",
                )
            slug = normalized_slug
        else:
            slug = await self._next_available_workspace_slug(base_slug=name)

        ws = await self.repo.create_workspace(
            organization_id=organization_id,
            slug=slug,
            name=name,
            description=description,
            created_by_user_id=user_id,
        )

        membership = await self.repo.ensure_active_membership(workspace_id=UUID(str(ws.id)), user_id=user_id)
        await self._ensure_operator_role_binding(
            workspace_id=UUID(str(ws.id)),
            membership_id=UUID(str(membership.id)),
            org_role=org_role,
        )
        await self.site_service.get_or_create_site_for_workspace(
            workspace_id=UUID(str(ws.id)),
            actor_user_id=user_id,
        )

        # Initialize workspace-level content strategy defaults so editors can rely on a stable policy contract.
        settings_service = WorkspaceSettingsService(self.settings)
        await settings_service.patch_core(
            workspace_id=UUID(str(ws.id)),
            patch={
                "content_strategy": {
                    "autosave": {"enabled": True, "interval_sec": 30, "save_on_blur": True},
                    "retention": {"draft_max_revisions": 100},
                }
            },
            updated_by=user_id,
        )

        self.logger.info(
            "Organization workspace created",
            action="organization_workspace_create",
            organization_id=str(organization_id),
            workspace_id=str(ws.id),
            user_id=str(user_id),
            template=str(payload.template),
        )

        creator_rows = await self.repo.list_users(user_ids=[user_id])
        creator = creator_rows[0] if creator_rows else None
        preview = (
            [
                OrganizationWorkspaceMemberPreviewOut(
                    user_id=creator.id,
                    username=creator.username,
                    display_name=creator.display_name,
                    email=creator.email,
                    avatar_url=creator.avatar_url,
                )
            ]
            if creator is not None
            else []
        )

        return self._build_workspace_out(
            organization_id=organization_id,
            workspace=ws,
            member_count=1 if preview else 0,
            members_preview=preview,
            enterable=True,
        )

    async def check_slug_availability(self, *, slug: str) -> OrganizationWorkspaceSlugAvailabilityOut:
        normalized_slug, err = parse_explicit_workspace_slug(slug)
        if err == "invalid":
            return OrganizationWorkspaceSlugAvailabilityOut(
                normalized_slug=None,
                available=False,
                reason="invalid",
            )
        if normalized_slug is None:
            return OrganizationWorkspaceSlugAvailabilityOut(
                normalized_slug=None,
                available=False,
                reason="invalid",
            )
        if err == "reserved":
            return OrganizationWorkspaceSlugAvailabilityOut(
                normalized_slug=normalized_slug,
                available=False,
                reason="reserved",
            )
        if await self.repo.slug_exists(slug=normalized_slug):
            return OrganizationWorkspaceSlugAvailabilityOut(
                normalized_slug=normalized_slug,
                available=False,
                reason="exists",
            )
        return OrganizationWorkspaceSlugAvailabilityOut(
            normalized_slug=normalized_slug,
            available=True,
            reason=None,
        )

    async def archive_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
    ) -> OrganizationWorkspaceArchiveResult:
        workspace = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        if workspace.archived_at is None:
            workspace.archived_at = datetime.now(UTC)
            workspace.archived_by_user_id = user_id
            await workspace.save(update_fields=["archived_at", "archived_by_user_id", "updated_at"])

        self.logger.info(
            "Organization workspace archived",
            action="organization_workspace_archive",
            organization_id=str(organization_id),
            workspace_id=str(workspace_id),
            user_id=str(user_id),
        )

        return OrganizationWorkspaceArchiveResult(
            workspace_id=workspace.id,
            is_archived=workspace.archived_at is not None,
            archived_at=workspace.archived_at,
            archived_by_user_id=workspace.archived_by_user_id,
        )

    async def unarchive_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
    ) -> OrganizationWorkspaceArchiveResult:
        workspace = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        if workspace.archived_at is not None or workspace.archived_by_user_id is not None:
            mutable_workspace = cast(WorkspaceArchiveMutableFields, workspace)
            mutable_workspace.archived_at = None
            mutable_workspace.archived_by_user_id = None
            await workspace.save(update_fields=["archived_at", "archived_by_user_id", "updated_at"])

        self.logger.info(
            "Organization workspace unarchived",
            action="organization_workspace_unarchive",
            organization_id=str(organization_id),
            workspace_id=str(workspace_id),
            user_id=str(user_id),
        )

        return OrganizationWorkspaceArchiveResult(
            workspace_id=workspace.id,
            is_archived=False,
            archived_at=None,
            archived_by_user_id=None,
        )

    async def delete_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
        confirm_name: str,
    ) -> OrganizationWorkspaceDeleteResult:
        workspace = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")

        normalized_confirm_name = str(confirm_name or "").strip()
        if normalized_confirm_name != str(workspace.name):
            raise BadRequest(
                message=t("errors", "BAD_REQUEST"),
                error="WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH",
            )

        if workspace.archived_at is None:
            active_count = await self.repo.count_active_non_archived_workspaces(organization_id=organization_id)
            if active_count <= 1:
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST"),
                    error="LAST_ACTIVE_WORKSPACE_NOT_DELETABLE",
                )

        await workspace.delete()

        self.logger.info(
            "Organization workspace hard deleted",
            action="organization_workspace_delete",
            organization_id=str(organization_id),
            workspace_id=str(workspace_id),
            user_id=str(user_id),
        )

        return OrganizationWorkspaceDeleteResult(workspace_id=workspace_id, deleted=True)

    async def _next_available_workspace_slug(self, *, base_slug: str) -> str:
        return await next_available_workspace_slug(
            base_slug=base_slug,
            exists_fn=lambda slug: self.repo.slug_exists(slug=slug),
        )

    async def _ensure_operator_role_binding(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        org_role: OrgRole,
    ) -> None:
        role_code = ROLE_OWNER if org_role == OrgRole.OWNER else ROLE_ADMIN
        rbac = RBACService(self.settings)
        await rbac.ensure_workspace_system_roles(workspace_id=workspace_id)
        role = await Role.get_or_none(workspace_id=workspace_id, code=role_code)
        if role is None:
            return
        await WorkspaceMembershipRole.get_or_create(membership_id=membership_id, role_id=role.id)

    def _build_workspace_out(
        self,
        *,
        organization_id: UUID,
        workspace: Workspace,
        member_count: int,
        members_preview: list[OrganizationWorkspaceMemberPreviewOut],
        enterable: bool,
    ) -> OrganizationWorkspaceOut:
        return OrganizationWorkspaceOut(
            id=workspace.id,
            workspace_id=workspace.id,
            organization_id=organization_id,
            slug=workspace.slug,
            name=workspace.name,
            description=workspace.description,
            icon_url=workspace.icon_url,
            is_archived=workspace.archived_at is not None,
            archived_at=workspace.archived_at,
            archived_by_user_id=workspace.archived_by_user_id,
            member_count=member_count,
            members_preview=members_preview,
            created_at=workspace.created_at,
            enterable=enterable,
        )

    def _sort_workspaces_default(self, *, rows: list[Workspace], archived: bool | None) -> list[Workspace]:
        if archived is True:
            return sorted(rows, key=lambda ws: ws.created_at)
        if archived is False:
            return sorted(rows, key=lambda ws: ws.created_at)
        return sorted(rows, key=lambda ws: (ws.archived_at is not None, ws.created_at))

    def _sort_workspaces(self, *, rows: list[Workspace], ordering: list[str]) -> list[Workspace]:
        out = list(rows)
        for raw in reversed(ordering):
            desc = raw.startswith("-")
            name = raw[1:] if desc else raw
            out.sort(
                key=lambda ws, field=name: self._workspace_sort_key(workspace=ws, field=field),
                reverse=desc,
            )
        return out

    def _workspace_sort_key(self, *, workspace: Workspace, field: str) -> tuple[int, Any]:
        if field == "name":
            return self._normalize_sort_value(workspace.name)
        if field == "slug":
            return self._normalize_sort_value(workspace.slug)
        if field == "archived_at":
            return self._normalize_sort_value(workspace.archived_at)
        return self._normalize_sort_value(workspace.created_at)

    def _normalize_sort_value(self, value: Any) -> tuple[int, Any]:
        if value is None:
            return (1, "")
        if isinstance(value, str):
            return (0, value.lower())
        return (0, value)
