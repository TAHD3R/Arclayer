from __future__ import annotations

from uuid import UUID

from fastapi import Depends

from apps.api.core.exceptions import Forbidden
from apps.api.core.i18n import t
from apps.api.models.org_membership import OrgMembership
from apps.api.routers.v1.auth.deps import get_current_user_id


async def get_current_org_membership(
    user_id: UUID = Depends(get_current_user_id),
) -> OrgMembership:
    """
    v2 org membership resolver (A2: single org per user).

    Unlike the legacy org selection dependency, this does NOT use X-Org-Id.
    """

    orgm = await OrgMembership.get_or_none(user_id=user_id)
    if orgm is None:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_MEMBERSHIP_REQUIRED",
        )
    return orgm


async def get_current_org_id_v2(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> UUID:
    return UUID(str(orgm.organization_id))


async def require_org_owner(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> OrgMembership:
    """
    System-level gate in v2.

    Notes:
    - We don't maintain org-scoped RBAC in v2 (workspace is the governance boundary).
    - For now, org owner is the only authority allowed to change system-wide settings.
    """

    if not orgm.is_owner:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED", default="权限不足"),
            error="ORG_OWNER_REQUIRED",
        )
    return orgm
