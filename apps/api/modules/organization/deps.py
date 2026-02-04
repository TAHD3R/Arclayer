from __future__ import annotations

from typing import cast
from uuid import UUID

from fastapi import Depends
from structlog.contextvars import bind_contextvars

from apps.api.common.protocols.tortoise import HasOrganizationId
from apps.api.core.exceptions import Forbidden
from apps.api.core.i18n import t
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole


async def get_current_org_membership(
    user_id: UUID = Depends(get_current_user_id),
) -> OrgMembership:
    """Resolve current org membership for the authenticated user."""

    orgm = await OrgMembership.get_or_none(user_id=user_id)
    if orgm is None:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_MEMBERSHIP_REQUIRED",
        )
    # Bind org context for downstream logs and audit events in this request.
    try:
        bind_contextvars(organization_id=str(cast(HasOrganizationId, orgm).organization_id))
    except Exception:
        pass
    return orgm


async def require_org_owner(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> OrgMembership:
    """
    System-level gate in v2.

    Notes:
    - We don't maintain org-scoped RBAC in v2 (workspace is the governance boundary).
    - For now, org owner is the only authority allowed to change system-wide settings.
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
    - Used for high-impact org operations (e.g. plugin management) that should not be
      exposed to regular members.
    """

    if orgm.role not in (OrgRole.OWNER, OrgRole.ADMIN):
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_ADMIN_REQUIRED",
        )
    return orgm
