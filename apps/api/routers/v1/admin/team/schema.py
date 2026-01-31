from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import EmailStr, Field

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.models.organization import MembershipStatus
from apps.api.models.user import UserStatus


class TeamMemberOut(BaseOut):
    membership_id: UUID = Field(..., description="Membership id in current org.")
    membership_status: MembershipStatus = Field(..., description="Membership status.")

    user_id: UUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar url.")
    user_status: UserStatus = Field(..., description="User status.")
    last_login_at: datetime | None = Field(default=None, description="User last login datetime (UTC).")

    role_codes: list[str] = Field(default_factory=list, description="Role codes in current org.")


class TeamMemberListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (username/email/display_name).")
    status: MembershipStatus | None = Field(default=None, description="Filter by membership status.")
    role_code: str | None = Field(default=None, description="Filter by role code.")
    user_status: UserStatus | None = Field(default=None, description="Filter by user status.")
    ordering: str | None = Field(
        default=None,
        description="Ordering, e.g. '-created_at', 'user__username'.",
    )


class TeamMemberRoleSetRequest(BaseSchema):
    role_codes: list[str] = Field(default_factory=list, description="Role codes to set for the member.")


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"
    EXPIRED = "expired"


class TeamInvitationOut(BaseOut):
    email: str = Field(..., description="Invitee email.")
    role_code: str | None = Field(default=None, description="Role code to assign when accepted.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")

    invited_by_user_id: UUID | None = Field(default=None, description="Inviter user id.")
    accepted_by_user_id: UUID | None = Field(default=None, description="Accepted by user id.")
    accepted_at: datetime | None = Field(default=None, description="Accepted datetime (UTC).")
    revoked_at: datetime | None = Field(default=None, description="Revoked datetime (UTC).")

    status: InvitationStatus = Field(..., description="Computed invitation status.")

    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class TeamInvitationCreateRequest(BaseSchema):
    email: EmailStr = Field(..., description="Invitee email.")
    role_code: str | None = Field(default=None, description="Role code to assign when accepted.")
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="Invitation TTL in seconds (default 7 days). Set null to never expire.",
    )


class TeamInvitationCreateResult(BaseSchema):
    invitation: TeamInvitationOut = Field(..., description="Created invitation.")
    token: str = Field(..., description="Raw token (show once).")
    invite_url: str | None = Field(default=None, description="Frontend invite URL if configured.")


class TeamInvitationListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (email/role_code).")
    status: InvitationStatus | None = Field(default=None, description="Filter by invitation status.")


class TeamInvitationRenewRequest(BaseSchema):
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="New invitation TTL in seconds (default 7 days). Set null to never expire.",
    )


class TeamUserRefOut(BaseSchema):
    user_id: UUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class TeamInviteLinkOut(BaseOut):
    code: str = Field(..., description="Non-secret invite code for UI display.")
    role_code: str | None = Field(default=None, description="Role code assigned when joining via this link.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")
    disabled_at: datetime | None = Field(default=None, description="Disabled datetime (UTC).")

    created_by: TeamUserRefOut | None = Field(default=None, description="Creator user summary.")
    last_used_by: TeamUserRefOut | None = Field(default=None, description="Last used by user summary.")
    last_used_at: datetime | None = Field(default=None, description="Last used datetime (UTC).")
    uses_count: int = Field(default=0, description="Total uses count.")

    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class TeamInviteLinkCreateRequest(BaseSchema):
    role_code: str | None = Field(default=None, description="Role code assigned when joining via the link.")
    emails: list[EmailStr] | None = Field(
        default=None,
        description="Optional recipient emails to deliver this invite link to (same token for all).",
    )
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="Invite link TTL in seconds (default 7 days). Set null to never expire.",
    )


class TeamInviteLinkCreateResult(BaseSchema):
    link: TeamInviteLinkOut = Field(..., description="Created invite link.")
    token: str = Field(..., description="Raw token (show once).")
    invite_url: str | None = Field(default=None, description="Frontend invite URL if configured.")


class TeamInviteLinkListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (code/role_code).")
    mine: bool | None = Field(default=None, description="If true, only return invite links created by me.")


class TeamInviteLinkRenewRequest(BaseSchema):
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="New invite link TTL in seconds (default 7 days). Set null to never expire.",
    )
