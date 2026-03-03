from __future__ import annotations

from pydantic import Field

from apps.api.src.common.schemas import BaseOut, BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.modules.organization.models.org_membership import OrgRole


class OrganizationBriefOut(BaseOut):
    name: str = Field(..., description="Organization name.")
    slug: str = Field(..., description="Organization slug (unique).")
    logo_url: str | None = Field(default=None, description="Organization logo url (optional).")


class OrganizationMembershipOut(BaseOut):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    role: OrgRole = Field(..., description="Organization role.")
    status: str = Field(..., description="Membership status.")


class OrganizationMemberPreviewOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="Member user id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class MyOrganizationOut(BaseSchema):
    organization: OrganizationBriefOut = Field(..., description="Current user organization.")
    membership: OrganizationMembershipOut = Field(..., description="Current user organization membership.")
    member_count: int = Field(default=0, ge=0, description="Active organization member count.")
    members_preview: list[OrganizationMemberPreviewOut] = Field(
        default_factory=list,
        description="Preview of active organization members.",
    )


class MyOrganizationListOut(BaseSchema):
    items: list[MyOrganizationOut] = Field(
        default_factory=list,
        description="Organizations accessible to current user.",
    )
    total: int = Field(default=0, ge=0, description="Total organizations for current user.")


class CreateMyOrganizationRequest(BaseSchema):
    name: str = Field(..., min_length=1, max_length=128, description="Organization display name.")
    slug: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Organization slug (optional, unique).",
    )
