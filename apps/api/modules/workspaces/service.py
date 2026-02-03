from __future__ import annotations

import re
from typing import cast
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.common.utils.tortoise_protocols import HasOrganizationId, HasWorkspaceId
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.i18n import t
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.workspaces.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from apps.api.modules.workspaces.schema import MyWorkspaceOut, WorkspaceDetailOut, WorkspaceUpdateRequest

_WORKSPACE_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


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
        """

        orgm = await OrgMembership.get_or_none(user_id=user_id)
        if orgm is None:
            return []

        is_owner = orgm.role == OrgRole.OWNER
        orgm_like = cast(HasOrganizationId, orgm)
        org_id = UUID(str(orgm_like.organization_id))

        # Collect memberships for the current user.
        memberships = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).all()
        membership_by_workspace_id = {UUID(str(cast(HasWorkspaceId, m).workspace_id)): m for m in memberships}

        workspaces: list[Workspace]
        if is_owner:
            workspaces = await Workspace.filter(organization_id=org_id, is_active=True).order_by("created_at").all()
        else:
            # Only list workspaces the user is a member of.
            ids = list(membership_by_workspace_id.keys())
            if not ids:
                return []
            workspaces = await Workspace.filter(id__in=ids, is_active=True).order_by("created_at").all()

        out: list[MyWorkspaceOut] = []
        for ws in workspaces:
            ws_id = UUID(str(ws.id))
            is_creator_admin = is_owner and (UUID(str(ws.created_by_user_id)) == UUID(str(user_id)))
            has_membership = ws_id in membership_by_workspace_id
            visible_only = bool(is_owner and (not has_membership) and (not is_creator_admin))
            out.append(
                MyWorkspaceOut(
                    id=ws.id,
                    workspace_id=ws.id,
                    organization_id=org_id,
                    slug=ws.slug,
                    name=ws.name,
                    visible_only=visible_only,
                    is_creator_admin=is_creator_admin,
                )
            )
        return out

    async def get_workspace_detail(self, *, organization_id: UUID, workspace_id: UUID) -> WorkspaceDetailOut:
        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        return WorkspaceDetailOut(
            id=ws.id,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            slug=ws.slug,
            name=ws.name,
        )

    async def update_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        payload: WorkspaceUpdateRequest,
    ) -> WorkspaceDetailOut:
        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        updates: dict[str, str] = {}
        if payload.name is not None:
            name = str(payload.name).strip()
            if not name:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            if len(name) > 128:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            updates["name"] = name

        if payload.slug is not None:
            slug = str(payload.slug).strip().lower()
            if not slug:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_SLUG")
            if len(slug) > 64:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_SLUG")
            if not _WORKSPACE_SLUG_RE.match(slug):
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_SLUG")

            exists = await Workspace.filter(organization_id=organization_id, slug=slug).exclude(id=ws.id).exists()
            if exists:
                raise Conflict(message=t("errors", "CONFLICT", default="资源冲突"), error="WORKSPACE_SLUG_EXISTS")
            updates["slug"] = slug

        if updates:
            for k, v in updates.items():
                setattr(ws, k, v)
            await ws.save(update_fields=list(updates.keys()) + ["updated_at"])

        return WorkspaceDetailOut(
            id=ws.id,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            slug=ws.slug,
            name=ws.name,
        )
