from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends, Path
from structlog.contextvars import bind_contextvars

from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.core.exceptions import Forbidden, NotFound
from src.core.i18n import t
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceKind,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from src.modules.workspaces.runtime.service import set_current_workspace_context


async def _require_active_workspace(*, workspace_id: PublicUUID) -> Workspace:
    ws = await Workspace.get_or_none(id=workspace_id, deleted_at__isnull=True)
    if ws is None or not ws.is_active:
        raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
    return ws


def _resolve_workspace_org_id(*, workspace: Workspace) -> UUID:
    workspace_like = cast(HasOrganizationId, workspace)
    return UUID(str(workspace_like.organization_id))


async def _find_active_org_membership(*, organization_id: UUID, user_id: UUID) -> OrgMembership | None:
    return (
        await OrgMembership
        .filter(
            user_id=user_id,
            organization_id=organization_id,
            status="active",
        )
        .order_by("created_at", "id")
        .first()
    )


async def _find_active_workspace_membership(*, workspace_id: UUID, user_id: UUID) -> WorkspaceMembership | None:
    return await WorkspaceMembership.get_or_none(
        workspace_id=workspace_id,
        user_id=user_id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )


async def _ensure_creator_admin_membership(*, workspace_id: UUID, user_id: UUID) -> WorkspaceMembership:
    return await WorkspaceMembership.create(
        workspace_id=workspace_id,
        user_id=user_id,
        status=WorkspaceMembershipStatus.ACTIVE,
        invited_by_user_id=None,
    )


async def _ensure_creator_admin_has_owner_role_binding(*, workspace_id: UUID, membership_id: UUID) -> None:
    from src.models.system.rbac import Role

    owner_role = await Role.get_or_none(workspace_id=workspace_id, code="owner", is_system=True)
    if owner_role is None:
        return
    await WorkspaceMembershipRole.get_or_create(membership_id=membership_id, role_id=owner_role.id)


def _bind_workspace_request_context(*, workspace_id: UUID, organization_id: UUID, membership_id: UUID | None) -> None:
    # Bind to logging context and request ContextVars used by authz/menu providers.
    bind_contextvars(workspace_id=str(workspace_id), organization_id=str(organization_id))
    if membership_id is not None:
        bind_contextvars(workspace_membership_id=str(membership_id))
    set_current_workspace_context(
        workspace_id=workspace_id,
        workspace_membership_id=membership_id,
        organization_id=organization_id,
    )


async def _resolve_guest_workspace_context(
    *,
    workspace: Workspace,
    organization_id: UUID,
    user_id: UUID,
) -> WorkspaceContext:
    workspace_uuid = UUID(str(workspace.id))

    membership = await _find_active_workspace_membership(workspace_id=workspace_uuid, user_id=user_id)
    if membership is None:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="WORKSPACE_ACCESS_DENIED",
        )

    membership_id = UUID(str(membership.id))
    _bind_workspace_request_context(
        workspace_id=workspace_uuid,
        organization_id=organization_id,
        membership_id=membership_id,
    )
    return WorkspaceContext(
        workspace_id=workspace_uuid,
        organization_id=organization_id,
        access_type=WorkspaceAccessType.GUEST,
        org_membership_id=None,
        is_org_owner=False,
        workspace_membership_id=membership_id,
        visible_only=False,
        is_creator_admin=False,
    )


async def _resolve_member_workspace_context(
    *,
    workspace: Workspace,
    organization_id: UUID,
    user_id: UUID,
    orgm: OrgMembership,
) -> WorkspaceContext:
    workspace_uuid = UUID(str(workspace.id))

    is_owner = orgm.role == OrgRole.OWNER
    is_creator_admin = bool(is_owner and (UUID(str(workspace.created_by_user_id)) == UUID(str(user_id))))

    membership = await _find_active_workspace_membership(workspace_id=workspace_uuid, user_id=user_id)
    if membership is None and is_creator_admin:
        membership = await _ensure_creator_admin_membership(workspace_id=workspace_uuid, user_id=user_id)
    if membership is not None and is_creator_admin:
        await _ensure_creator_admin_has_owner_role_binding(
            workspace_id=workspace_uuid,
            membership_id=UUID(str(membership.id)),
        )

    membership_id = UUID(str(membership.id)) if membership is not None else None
    visible_only = bool(is_owner and membership_id is None and not is_creator_admin)
    _bind_workspace_request_context(
        workspace_id=workspace_uuid,
        organization_id=organization_id,
        membership_id=membership_id,
    )
    return WorkspaceContext(
        workspace_id=workspace_uuid,
        organization_id=organization_id,
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=UUID(str(orgm.id)),
        is_org_owner=is_owner,
        workspace_membership_id=membership_id,
        visible_only=visible_only,
        is_creator_admin=is_creator_admin,
    )


async def get_workspace_context(
    workspace_id: Annotated[PublicUUID, Path(..., description="Workspace ID.")],
    user_id: UUID = Depends(get_current_user_id),
) -> WorkspaceContext:
    """Resolve workspace request context (member vs guest)."""

    workspace = await _require_active_workspace(workspace_id=workspace_id)
    if workspace.kind == WorkspaceKind.PERSONAL and UUID(str(workspace.owner_user_id)) != user_id:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="WORKSPACE_ACCESS_DENIED",
        )
    organization_id = _resolve_workspace_org_id(workspace=workspace)

    orgm = await _find_active_org_membership(organization_id=organization_id, user_id=user_id)
    if orgm is None:
        return await _resolve_guest_workspace_context(
            workspace=workspace,
            organization_id=organization_id,
            user_id=user_id,
        )
    return await _resolve_member_workspace_context(
        workspace=workspace,
        organization_id=organization_id,
        user_id=user_id,
        orgm=orgm,
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
