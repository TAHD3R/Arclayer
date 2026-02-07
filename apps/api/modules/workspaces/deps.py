from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends, Path
from pydantic import Field
from structlog.contextvars import bind_contextvars

from apps.api.common.protocols.tortoise import HasOrganizationId
from apps.api.common.schemas import BaseSchema
from apps.api.common.types.public_uuid import PublicUUID
from apps.api.core.exceptions import Forbidden, NotFound
from apps.api.core.i18n import t
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.workspaces.context import set_current_workspace_context
from apps.api.modules.workspaces.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus


class WorkspaceContext(BaseSchema):
    workspace_id: UUID = Field(..., description="Workspace id.")
    organization_id: UUID = Field(..., description="Organization id for this workspace.")

    org_membership_id: UUID = Field(..., description="Org membership id.")
    is_org_owner: bool = Field(default=False, description="Whether current user is the org owner.")

    workspace_membership_id: UUID | None = Field(default=None, description="Workspace membership id (if any).")
    visible_only: bool = Field(
        default=False,
        description="If true, workspace is visible to the user but not manageable unless explicitly granted.",
    )
    is_creator_admin: bool = Field(
        default=False,
        description="If true, org owner created this workspace and gets implicit admin management rights.",
    )


async def get_workspace_context(
    workspace_id: Annotated[PublicUUID, Path(..., description="Workspace ID.")],
    user_id: UUID = Depends(get_current_user_id),
) -> WorkspaceContext:
    """
    Resolve current workspace and enforce org boundary.

    Behavior:
    - The user must belong to exactly one organization (OrgMembership).
    - The workspace must belong to that organization.
    - Workspace membership is optional for org owner visibility (E1).
    - If user is org owner AND is the workspace creator, they get implicit admin rights:
      we ensure an active workspace membership exists to simplify downstream checks.
    """

    ws = await Workspace.get_or_none(id=workspace_id)
    if ws is None or not ws.is_active:
        raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

    orgm = await OrgMembership.get_or_none(user_id=user_id)
    if orgm is None:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED", default="权限不足"), error="ORG_MEMBERSHIP_REQUIRED")

    orgm_like = cast(HasOrganizationId, orgm)
    ws_like = cast(HasOrganizationId, ws)
    ws_org_id = UUID(str(ws_like.organization_id))
    if UUID(str(orgm_like.organization_id)) != ws_org_id:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED", default="权限不足"), error="CROSS_ORG_ACCESS_DENIED")

    is_owner = orgm.role == OrgRole.OWNER
    is_creator_admin = bool(is_owner and (UUID(str(ws.created_by_user_id)) == UUID(str(user_id))))

    membership = await WorkspaceMembership.get_or_none(
        workspace_id=ws.id,
        user_id=user_id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )

    # Creator-admin gets implicit management rights; ensure a membership exists so role bindings
    # can be attached (and so downstream repositories can rely on membership_id).
    if membership is None and is_creator_admin:
        membership = await WorkspaceMembership.create(
            workspace_id=ws.id,
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )

    # Ensure creator-admin has an explicit Owner role binding as early as possible.
    #
    # Why:
    # - Menu visibility is permission-filtered by roles; creator-admin is expected to have full access.
    # - Some endpoints may not hit `require_workspace_permission()` early enough to perform lazy binding.
    if membership is not None and is_creator_admin:
        try:
            from apps.api.modules.system.models.rbac import Role
            from apps.api.modules.workspaces.models.workspace import WorkspaceMembershipRole

            owner_role = await Role.get_or_none(workspace_id=ws.id, code="owner", is_system=True)
            if owner_role is not None:
                await WorkspaceMembershipRole.get_or_create(membership_id=membership.id, role_id=owner_role.id)
        except Exception:
            # Best-effort; do not block request context resolution.
            pass

    visible_only = bool(is_owner and membership is None and not is_creator_admin)

    # Bind to logging context and request ContextVars used by authz/menu providers.
    bind_contextvars(workspace_id=str(ws.id), organization_id=str(ws_org_id))
    if membership is not None:
        bind_contextvars(workspace_membership_id=str(membership.id))
    set_current_workspace_context(
        workspace_id=ws.id,
        workspace_membership_id=(membership.id if membership else None),
        organization_id=ws_org_id,
    )

    return WorkspaceContext(
        workspace_id=ws.id,
        organization_id=ws_org_id,
        org_membership_id=orgm.id,
        is_org_owner=is_owner,
        workspace_membership_id=(membership.id if membership else None),
        visible_only=visible_only,
        is_creator_admin=is_creator_admin,
    )


async def require_workspace_manage_access(
    ctx: WorkspaceContext = Depends(get_workspace_context),
) -> WorkspaceContext:
    """
    Ensure the current user can manage the workspace (not visible-only).
    """

    if ctx.visible_only or ctx.workspace_membership_id is None:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED", default="权限不足"), error="WORKSPACE_ACCESS_DENIED")
    return ctx
