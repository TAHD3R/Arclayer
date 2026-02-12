from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.common.protocols.tortoise import HasOrganizationId, HasWorkspaceId
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Forbidden, NotFound
from apps.api.core.i18n import t
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.system.models.rbac import Role
from apps.api.modules.system.rbac.constants import ROLE_OWNER
from apps.api.modules.workspaces.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from apps.api.modules.workspaces.schema import (
    LeaveWorkspaceResult,
    MyWorkspaceOut,
    WorkspaceDetailOut,
    WorkspaceUpdateRequest,
)


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

        orgm = (
            await OrgMembership.filter(user_id=user_id, status="active")
            .order_by("created_at", "id")
            .first()
        )
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

        if "slug" in payload.model_fields_set:
            raise BadRequest(
                message=t("errors", "WORKSPACE_SLUG_IMMUTABLE", default="Workspace slug cannot be changed"),
                error="WORKSPACE_SLUG_IMMUTABLE",
            )

        updates: dict[str, str] = {}
        if payload.name is not None:
            name = str(payload.name).strip()
            if not name:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            if len(name) > 128:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            updates["name"] = name

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
