from __future__ import annotations

from collections import defaultdict
from typing import cast
from uuid import UUID, uuid4

from apps.api.common.protocols.tortoise import HasUserId, HasWorkspaceId
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Forbidden, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.core.i18n import t
from apps.api.modules.assets.utils import slugify
from apps.api.modules.organization.models.org_membership import OrgRole
from apps.api.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from apps.api.modules.organization.workspaces.schema import (
    OrganizationWorkspaceCreateRequest,
    OrganizationWorkspaceDeleteResult,
    OrganizationWorkspaceMemberPreviewOut,
    OrganizationWorkspaceOut,
)
from apps.api.modules.system.models.rbac import Role
from apps.api.modules.system.rbac.constants import ROLE_ADMIN, ROLE_OWNER
from apps.api.modules.system.rbac.service import RBACService
from apps.api.modules.workspaces.models.workspace import WorkspaceMembershipRole
from apps.api.modules.workspaces.site.service import WorkspaceSiteService


class OrganizationWorkspaceService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationWorkspaceRepository()
        self.site_service = WorkspaceSiteService(settings)

    async def list_workspaces(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
        params: PageParams,
        q: str | None,
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
                if needle in str(ws.name or "").lower() or needle in str(ws.slug or "").lower()
            ]

        workspace_ids = [UUID(str(ws.id)) for ws in rows]
        memberships = await self.repo.list_active_memberships(workspace_ids=workspace_ids)

        members_by_workspace: dict[UUID, list[UUID]] = defaultdict(list)
        for membership in memberships:
            ws_id = UUID(str(cast(HasWorkspaceId, membership).workspace_id))
            user_id_value = cast(HasUserId, membership).user_id
            if user_id_value is not None:
                members_by_workspace[ws_id].append(UUID(str(user_id_value)))

        unique_user_ids = list({uid for ids in members_by_workspace.values() for uid in ids})
        users = await self.repo.list_users(user_ids=unique_user_ids)
        user_by_id = {UUID(str(u.id)): u for u in users}

        out_items: list[OrganizationWorkspaceOut] = []
        for ws in rows:
            ws_id = UUID(str(ws.id))
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
                OrganizationWorkspaceOut(
                    id=ws.id,
                    workspace_id=ws.id,
                    organization_id=organization_id,
                    slug=ws.slug,
                    name=ws.name,
                    description=None,
                    icon_url=None,
                    member_count=len(member_ids),
                    members_preview=preview,
                    created_at=ws.created_at,
                )
            )

        return paginate_items(out_items, params=params)

    async def create_workspace(
        self,
        *,
        organization_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
        payload: OrganizationWorkspaceCreateRequest,
    ) -> OrganizationWorkspaceOut:
        if org_role not in (OrgRole.OWNER, OrgRole.ADMIN):
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                error="ORG_ADMIN_REQUIRED",
            )

        name = str(payload.name or "").strip()
        if not name:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")

        slug = await self._next_available_workspace_slug(
            organization_id=organization_id,
            base_slug=slugify(name) or "workspace",
        )

        ws = await self.repo.create_workspace(
            organization_id=organization_id,
            slug=slug,
            name=name[:128],
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

        return OrganizationWorkspaceOut(
            id=ws.id,
            workspace_id=ws.id,
            organization_id=organization_id,
            slug=ws.slug,
            name=ws.name,
            description=None,
            icon_url=None,
            member_count=1 if preview else 0,
            members_preview=preview,
            created_at=ws.created_at,
        )

    async def delete_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        org_role: OrgRole,
    ) -> OrganizationWorkspaceDeleteResult:
        if org_role not in (OrgRole.OWNER, OrgRole.ADMIN):
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                error="ORG_ADMIN_REQUIRED",
            )

        ws = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        active_count = await self.repo.count_active_workspaces(organization_id=organization_id)
        if active_count <= 1:
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="参数错误"),
                error="LAST_WORKSPACE_NOT_DELETABLE",
            )

        ws.is_active = False
        await ws.save(update_fields=["is_active", "updated_at"])

        self.logger.info(
            "Organization workspace deleted",
            action="organization_workspace_delete",
            organization_id=str(organization_id),
            workspace_id=str(workspace_id),
            user_id=str(user_id),
        )

        return OrganizationWorkspaceDeleteResult(workspace_id=workspace_id, deleted=True)

    async def _next_available_workspace_slug(self, *, organization_id: UUID, base_slug: str) -> str:
        base = (base_slug or "workspace").strip("-") or "workspace"
        candidate = base[:64]
        for index in range(1, 200):
            in_use = await self.repo.slug_exists(organization_id=organization_id, slug=candidate)
            if not in_use:
                return candidate
            suffix = f"-{index + 1}"
            candidate = f"{base[: max(1, 64 - len(suffix))]}{suffix}"
        return f"{base[:55]}-{uuid4().hex[:8]}"

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
