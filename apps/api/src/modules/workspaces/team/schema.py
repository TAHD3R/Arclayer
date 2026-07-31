from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import EmailStr, Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.organization.user import UserStatus
from src.models.workspaces.workspace import WorkspaceMembershipStatus


class WorkspaceTeamUserRefOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class WorkspaceTeamUserOptionOut(BaseSchema):
    """
    Lightweight user option for Select components.

    Notes:
    - Keep payload minimal and stable (value/label/avatar) for UI consumption.
    """

    value: PublicUUID = Field(..., description="User id (value).")
    label: str = Field(..., description="User display label.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class WorkspaceTeamMemberOut(BaseOut):
    membership_id: PublicUUID = Field(..., description="Workspace membership id.")
    membership_status: WorkspaceMembershipStatus = Field(..., description="Workspace membership status.")
    is_owner: bool = Field(..., description="Whether this user is the canonical workspace owner.")

    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar url.")
    user_status: UserStatus = Field(..., description="User status.")
    last_login_at: datetime | None = Field(default=None, description="User last login datetime (UTC).")

    role_codes: list[str] = Field(default_factory=list, description="Role codes in current workspace.")


class WorkspaceTeamMemberListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (username/email/display_name).")
    status: WorkspaceMembershipStatus | None = Field(default=None, description="Filter by membership status.")
    role_code: str | None = Field(default=None, description="Filter by role code.")
    user_status: UserStatus | None = Field(default=None, description="Filter by user status.")
    ordering: str | None = Field(default=None, description="Ordering, e.g. '-created_at', 'user__username'.")


class WorkspaceTeamMemberRoleSetRequest(BaseSchema):
    role_codes: list[str] = Field(default_factory=list, description="Role codes to set for the member.")


class WorkspaceTeamUserUpdateRequest(BaseSchema):
    """
    Update user profile fields for a member within a workspace.

    Notes:
    - User identity is global (account-level), but the operation must be scoped by workspace
      to avoid cross-workspace manipulation.
    """

    email: EmailStr | None = Field(default=None, description="Email (nullable).")
    display_name: str | None = Field(default=None, description="Display name (nullable).")
    avatar_url: str | None = Field(default=None, description="Avatar URL (nullable).")


class WorkspaceTeamResetPasswordRequest(BaseSchema):
    new_password: str = Field(min_length=8, max_length=128, description="New password.")


class WorkspaceTeamMemberStatusResult(BaseSchema):
    membership_id: PublicUUID = Field(..., description="Workspace membership id.")
    status: WorkspaceMembershipStatus = Field(..., description="Updated membership status.")


class InviteStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"
    EXPIRED = "expired"


class WorkspaceInviteJoinMode(StrEnum):
    MEMBER = "member"
    GUEST = "guest"


class WorkspaceEmailInviteOut(BaseOut):
    email: str = Field(..., description="Invitee email.")
    role_code: str | None = Field(default=None, description="Role code to assign when accepted.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")

    created_by_user_id: PublicUUID = Field(..., description="Inviter user id.")
    created_by: WorkspaceTeamUserRefOut | None = Field(default=None, description="Inviter user summary.")

    accepted_by_user_id: PublicUUID | None = Field(default=None, description="Accepted by user id.")
    accepted_by: WorkspaceTeamUserRefOut | None = Field(default=None, description="Accepted by user summary.")
    accepted_at: datetime | None = Field(default=None, description="Accepted datetime (UTC).")

    revoked_at: datetime | None = Field(default=None, description="Revoked datetime (UTC).")

    status: InviteStatus = Field(..., description="Computed status.")

    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class WorkspaceEmailInviteCreateRequest(BaseSchema):
    email: EmailStr = Field(..., description="Invitee email.")
    role_code: str | None = Field(default=None, description="Role code to assign when accepted.")
    join_mode: WorkspaceInviteJoinMode = Field(
        default=WorkspaceInviteJoinMode.MEMBER,
        description="Join mode: member joins org + workspace; guest joins workspace only.",
    )
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="Invitation TTL in seconds (default 7 days). Set null to never expire.",
    )


class WorkspaceEmailInviteCreateResult(BaseSchema):
    invitation: WorkspaceEmailInviteOut = Field(..., description="Created/updated email invite.")
    token: str = Field(..., description="Signed token.")
    invite_url: str | None = Field(default=None, description="Frontend invite URL if configured.")


class WorkspaceEmailInviteListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (email/role_code).")
    status: InviteStatus | None = Field(default=None, description="Filter by status.")
    mine: bool | None = Field(default=None, description="If true, only return invites created by me.")


class WorkspaceEmailInviteRenewRequest(BaseSchema):
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="New invitation TTL in seconds (default 7 days). Set null to never expire.",
    )


class WorkspaceInviteLinkParticipantOut(BaseSchema):
    user: WorkspaceTeamUserRefOut = Field(..., description="Participant user summary.")
    used_at: datetime = Field(..., description="Used at datetime (UTC).")


class WorkspaceInviteLinkOut(BaseOut):
    display_code: str = Field(..., description="UI display code (short).")
    role_code: str | None = Field(default=None, description="Role code assigned when joining via this link.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")
    disabled_at: datetime | None = Field(default=None, description="Disabled datetime (UTC).")
    max_uses: int | None = Field(default=None, description="Max uses (null means unlimited).")
    allowed_email_domain: str | None = Field(default=None, description="Optional allowed email domain.")

    created_by: WorkspaceTeamUserRefOut | None = Field(default=None, description="Creator user summary.")
    last_used_by: WorkspaceTeamUserRefOut | None = Field(default=None, description="Last used by user summary.")
    last_used_at: datetime | None = Field(default=None, description="Last used datetime (UTC).")
    uses_count: int = Field(default=0, description="Total uses count.")

    recent_participants: list[WorkspaceInviteLinkParticipantOut] = Field(
        default_factory=list,
        description="Recent invite link participants (usage events).",
    )

    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class WorkspaceInviteLinkCreateRequest(BaseSchema):
    role_code: str | None = Field(default=None, description="Role code assigned when joining via the link.")
    join_mode: WorkspaceInviteJoinMode = Field(
        default=WorkspaceInviteJoinMode.MEMBER,
        description="Join mode: member joins org + workspace; guest joins workspace only.",
    )
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="Invite link TTL in seconds (default 7 days). Set null to never expire.",
    )
    max_uses: int | None = Field(default=None, ge=1, description="Optional max uses (null means unlimited).")
    allowed_email_domain: str | None = Field(
        default=None,
        description="Optional allowed email domain (e.g. 'example.com').",
    )


class WorkspaceInviteLinkCreateResult(BaseSchema):
    link: WorkspaceInviteLinkOut = Field(..., description="Created invite link.")
    token: str = Field(..., description="Signed token.")
    invite_url: str | None = Field(default=None, description="Frontend invite URL if configured.")


class WorkspaceInviteLinkListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (display_code/role_code).")
    mine: bool | None = Field(default=None, description="If true, only return invite links created by me.")


class WorkspaceInviteLinkRenewRequest(BaseSchema):
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=60,
        description="New invite link TTL in seconds (default 7 days). Set null to never expire.",
    )
