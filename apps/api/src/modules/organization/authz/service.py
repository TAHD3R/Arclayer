from __future__ import annotations

from typing import cast
from uuid import UUID

from src.common.protocols.tortoise import HasOrganizationId, HasUserId
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.modules.organization.authz.schema import OrganizationAuthzSnapshot, OrganizationPermissionActionOut
from src.modules.organization.rbac.catalog import get_organization_permission_catalog
from src.modules.organization.rbac.service import OrganizationRBACService


def list_organization_permission_actions() -> list[OrganizationPermissionActionOut]:
    return [
        OrganizationPermissionActionOut(
            code=action,
            description=definition.description,
            subject_kinds=list(definition.subject_kinds),
            permission_codes=list(definition.permission_codes),
        )
        for action, definition in sorted(get_organization_permission_catalog().items(), key=lambda entry: entry[0])
    ]


async def get_organization_authz_snapshot(
    *,
    membership: OrgMembership,
    service: OrganizationRBACService,
) -> OrganizationAuthzSnapshot:
    organization_id = UUID(str(cast(HasOrganizationId, membership).organization_id))
    user_id = UUID(str(cast(HasUserId, membership).user_id))
    await service.ensure_defaults(organization_id=organization_id)

    resolved_role_code = service.resolve_membership_role_code(membership)
    fallback_role_code = str(cast(OrgRole, membership.role).value)
    role = await service.repo.get_role_by_code(organization_id=organization_id, code=resolved_role_code)
    if role is None and resolved_role_code != fallback_role_code:
        role = await service.repo.get_role_by_code(organization_id=organization_id, code=fallback_role_code)

    if role is None:
        return OrganizationAuthzSnapshot(
            organization_id=organization_id,
            user_id=user_id,
            role_codes=[],
            permission_codes=[],
            is_superuser=False,
        )

    permissions = await service.repo.list_role_permissions(role_id=UUID(str(role.id)))
    permission_codes = sorted({str(permission.code) for permission in permissions if str(permission.code).strip()})
    return OrganizationAuthzSnapshot(
        organization_id=organization_id,
        user_id=user_id,
        role_codes=[str(role.code)],
        permission_codes=permission_codes,
        is_superuser=False,
    )
