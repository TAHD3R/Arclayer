from __future__ import annotations

from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class OrganizationBriefOut(BaseOut):
    name: str = Field(..., description="Organization name.")
    slug: str = Field(..., description="Organization slug (unique).")
    logo_url: str | None = Field(default=None, description="Organization logo url (optional).")


class OrganizationMembershipOut(BaseOut):
    organization_id: UUID = Field(..., description="Organization id.")
    is_owner: bool = Field(..., description="Whether current user is organization owner.")
    status: str = Field(..., description="Membership status.")


class MyOrganizationOut(BaseSchema):
    organization: OrganizationBriefOut = Field(..., description="Current user's organization.")
    membership: OrganizationMembershipOut = Field(..., description="Current user's org membership.")
