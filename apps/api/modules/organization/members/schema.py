from __future__ import annotations

from datetime import datetime

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.common.types.public_uuid import PublicUUID
from apps.api.modules.organization.models.org_membership import OrgRole


class OrganizationMemberOut(BaseOut):
    membership_id: PublicUUID = Field(..., description="Organization membership id.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    role: OrgRole = Field(..., description="Organization role.")
    status: str = Field(..., description="Membership status.")
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email address.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")
    last_login_at: datetime | None = Field(default=None, description="Last login timestamp.")
    joined_at: datetime = Field(..., description="Join timestamp.")


class OrganizationMemberRoleUpdateRequest(BaseSchema):
    role: OrgRole = Field(..., description="Target organization role.")


class OrganizationMemberInviteRequest(BaseSchema):
    email: str = Field(..., min_length=3, max_length=255, description="Invitee email address.")
    role: OrgRole = Field(default=OrgRole.MEMBER, description="Requested organization role.")
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=300,
        le=30 * 24 * 60 * 60,
        description="Invite TTL in seconds.",
    )


class OrganizationMemberInviteResult(BaseSchema):
    invitation_id: PublicUUID = Field(..., description="Underlying invitation id.")
    email: str = Field(..., description="Invitee email.")
    role: OrgRole = Field(..., description="Requested organization role.")
    workspace_id: PublicUUID = Field(..., description="Workspace receiving the invite.")
    token: str = Field(..., description="Signed invite token.")
    invite_url: str | None = Field(default=None, description="Accept invite URL.")


class OrganizationMemberDeleteResult(BaseSchema):
    membership_id: PublicUUID = Field(..., description="Deleted membership id.")
    removed: bool = Field(default=True, description="Whether the member was removed.")
