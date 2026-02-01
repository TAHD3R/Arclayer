from __future__ import annotations

from uuid import UUID

from apps.api.common.repositories import BaseRepository
from apps.api.models.org_membership import OrgMembership, OrgRole
from apps.api.models.organization import Organization


class OrganizationRepository(BaseRepository):
    """
    Organization repository (v2).

    Notes:
    - A2: a user belongs to exactly one organization (enforced by OrgMembership.user unique).
    - We intentionally removed org selection (no X-Org-Id), so this repository does not expose
      "list my orgs" helpers anymore.
    """

    async def create_organization(self, *, slug: str, name: str, logo_url: str | None = None) -> Organization:
        return await Organization.create(slug=slug, name=name, logo_url=logo_url, is_active=True)

    async def ensure_org_membership(
        self,
        *,
        user_id: UUID,
        organization_id: UUID,
        role: OrgRole = OrgRole.MEMBER,
    ) -> OrgMembership:
        orgm, _ = await OrgMembership.get_or_create(
            user_id=user_id,
            defaults={"organization_id": organization_id, "role": role, "status": "active"},
        )
        # Defensive: if the user already belongs to another org, we do not auto-migrate here.
        return orgm
