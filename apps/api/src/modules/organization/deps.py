from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends, Path
from structlog.contextvars import bind_contextvars

from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.exceptions import Forbidden
from apps.api.src.core.i18n import t
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole


def _bind_org_context(orgm: OrgMembership) -> None:
    # Keep org id in structured logs for downstream handlers.
    try:
        bind_contextvars(organization_id=str(cast(HasOrganizationId, orgm).organization_id))
    except (RuntimeError, TypeError, ValueError):
        pass


async def get_current_org_membership(
    user_id: UUID = Depends(get_current_user_id),
) -> OrgMembership:
    """Resolve the default org membership for the authenticated user."""

    orgm = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").first()
    if orgm is None:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_MEMBERSHIP_REQUIRED",
        )
    _bind_org_context(orgm)
    return orgm


async def get_org_membership_for_organization(
    organization_id: Annotated[PublicUUID, Path(..., description="Organization ID.")],
    user_id: UUID = Depends(get_current_user_id),
) -> OrgMembership:
    """Resolve membership for an explicit organization path parameter."""

    orgm = (
        await OrgMembership
        .filter(
            user_id=user_id,
            organization_id=UUID(str(organization_id)),
            status="active",
        )
        .order_by("created_at", "id")
        .first()
    )
    if orgm is None:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_MEMBERSHIP_REQUIRED",
        )
    _bind_org_context(orgm)
    return orgm


async def require_org_owner(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> OrgMembership:
    """
    System-level gate in v2.

    Notes:
    - We do not maintain org scoped RBAC in v2 (workspace is the governance boundary).
    - For now, org owner is the only authority allowed to change system wide settings.
    """

    if orgm.role != OrgRole.OWNER:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_OWNER_REQUIRED",
        )
    return orgm


async def require_org_admin(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> OrgMembership:
    """
    Organization-level admin gate.

    - OWNER implies ADMIN permissions.
    - Used for high-impact org operations (for example plugin management) that should not be
      exposed to regular members.
    """

    if orgm.role not in (OrgRole.OWNER, OrgRole.ADMIN):
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_ADMIN_REQUIRED",
        )
    return orgm
