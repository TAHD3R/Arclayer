from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends, Path
from structlog.contextvars import bind_contextvars

from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.modules.auth.http.service import get_current_user_id
from src.modules.organization.rbac.service import OrganizationRBACService


def _bind_org_context(orgm: OrgMembership) -> None:
    # Keep org id in structured logs for downstream handlers.
    bind_contextvars(organization_id=str(cast(HasOrganizationId, orgm).organization_id))


async def get_current_org_membership(
    user_id: UUID = Depends(get_current_user_id),
) -> OrgMembership:
    """Resolve the default org membership for the authenticated user."""

    orgm = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").first()
    if orgm is None:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED"),
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
            message=t("errors", "PERMISSION_DENIED"),
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
            message=t("errors", "PERMISSION_DENIED"),
            error="ORG_OWNER_REQUIRED",
        )
    return orgm


async def require_org_admin(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> OrgMembership:
    """
    Organization-level admin gate.

    - OWNER implies ADMIN permissions.
    - Used for high-impact org operations such as platform administration that should not be
      exposed to regular members.
    """

    if orgm.role not in (OrgRole.OWNER, OrgRole.ADMIN):
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED"),
            error="ORG_ADMIN_REQUIRED",
        )
    return orgm


OrgMembershipDependency = Callable[..., Awaitable[OrgMembership]]


def require_org_permission(
    permission_code: str,
    *,
    error_code: str = "ORG_PERMISSION_DENIED",
    membership_dependency: OrgMembershipDependency = get_current_org_membership,
):
    async def _dep(
        orgm: OrgMembership = Depends(membership_dependency),
        settings: Settings = Depends(get_settings),
    ) -> OrgMembership:
        service = OrganizationRBACService(settings)
        await service.ensure_permission(
            organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
            membership=orgm,
            permission_code=permission_code,
            error_code=error_code,
        )
        return orgm

    return Depends(_dep)
