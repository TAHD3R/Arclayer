from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends, Path
from structlog.contextvars import bind_contextvars

from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.exceptions import Forbidden, NotFound
from apps.api.src.core.i18n import t
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.runtime.service import set_current_workspace_context


async def get_workspace_context(
    workspace_id: Annotated[PublicUUID, Path(..., description="Workspace ID.")],
    user_id: UUID = Depends(get_current_user_id),
) -> WorkspaceContext:
    """
    Resolve current workspace and enforce org boundary.

    Behavior:
    - The user must belong to the target organization.
    - The workspace must belong to that organization.
    - Workspace membership is optional for org owner visibility (E1).
    - If user is org owner AND is the workspace creator, they get implicit admin rights:
      we ensure an active workspace membership exists to simplify downstream checks.
    """

    ws = await Workspace.get_or_none(id=workspace_id)
    if ws is None or not ws.is_active:
        raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

    ws_like = cast(HasOrganizationId, ws)
    ws_org_id = UUID(str(ws_like.organization_id))

    orgm = (
        await OrgMembership
        .filter(
            user_id=user_id,
            organization_id=ws_org_id,
            status="active",
        )
        .order_by("created_at", "id")
        .first()
    )
    if orgm is None:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED", default="权限不足"), error="ORG_MEMBERSHIP_REQUIRED")

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
        from apps.api.src.models.system.rbac import Role

        owner_role = await Role.get_or_none(workspace_id=ws.id, code="owner", is_system=True)
        if owner_role is not None:
            await WorkspaceMembershipRole.get_or_create(membership_id=membership.id, role_id=owner_role.id)

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
