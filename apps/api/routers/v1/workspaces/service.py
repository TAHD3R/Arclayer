from __future__ import annotations

from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.models.org_membership import OrgMembership
from apps.api.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from apps.api.routers.v1.workspaces.schema import MyWorkspaceOut


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

        is_owner = bool(orgm.is_owner)
        org_id = UUID(str(orgm.organization_id))

        # Collect memberships for the current user.
        memberships = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).all()
        membership_by_workspace_id = {UUID(str(m.workspace_id)): m for m in memberships}

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
