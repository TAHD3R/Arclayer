from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind


class OrganizationRepository(TortoiseORMRepository):
    """
    Organization repository.

    Notes:
    - We intentionally removed org selection (no X-Org-Id), so this repository does not expose
      "list my orgs" helpers anymore.
    """

    async def create_organization(
        self,
        *,
        slug: str,
        name: str,
        logo_url: str | None = None,
        kind: OrganizationKind = OrganizationKind.TEAM,
        owner_user_id: UUID | None = None,
    ) -> Organization:
        return await Organization.create(
            slug=slug,
            name=name,
            kind=kind,
            owner_user_id=owner_user_id,
            logo_url=logo_url,
            is_active=True,
            deleted_at=None,
        )

    async def get_by_id_in_connection(
        self,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient,
    ) -> Organization | None:
        return await Organization.get_or_none(id=organization_id, using_db=conn)

    async def get_onboarding_team_organization(self, *, owner_user_id: UUID) -> Organization | None:
        return (
            await Organization
            .filter(kind=OrganizationKind.TEAM, owner_user_id=owner_user_id)
            .order_by("created_at", "id")
            .first()
        )

    async def ensure_org_membership(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        role: OrgRole = OrgRole.MEMBER,
    ) -> OrgMembership:
        orgm, _ = await OrgMembership.get_or_create(
            organization_id=organization_id,
            user_id=user_id,
            defaults={
                "role": role,
                "role_code": role.value,
                "status": "active",
            },
        )
        if orgm.status != "active" or orgm.role != role or orgm.role_code != role.value:
            orgm.status = "active"
            orgm.role = role
            orgm.role_code = role.value
            await orgm.save(update_fields=["status", "role", "role_code", "updated_at"])
        return orgm
