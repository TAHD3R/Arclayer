from __future__ import annotations

from datetime import datetime

from pydantic import Field, model_validator

from apps.api.src.common.schemas import BaseOut, BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.modules.organization.models.org_membership import OrgRole
from apps.api.src.modules.organization.models.user import UserStatus


class OrganizationMemberWorkspaceOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    workspace_name: str = Field(..., description="Workspace name.")
    workspace_slug: str = Field(..., description="Workspace slug.")
    membership_status: str = Field(..., description="Workspace membership status.")
    role_codes: list[str] = Field(default_factory=list, description="Workspace role codes for this member.")
    joined_at: datetime = Field(..., description="Workspace membership created time.")


class OrganizationMemberOut(BaseOut):
    membership_id: PublicUUID = Field(..., description="Organization membership id.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    role: OrgRole = Field(..., description="Built-in organization role for compatibility guards.")
    role_code: str = Field(..., description="Effective organization role code.")
    status: str = Field(..., description="Organization membership status.")
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email address.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")
    user_status: UserStatus = Field(..., description="User account status.")
    last_login_at: datetime | None = Field(default=None, description="Last login timestamp.")
    joined_at: datetime = Field(..., description="Organization join timestamp.")
    workspace_count: int = Field(default=0, ge=0, description="Associated workspace count.")
    workspaces: list[OrganizationMemberWorkspaceOut] = Field(
        default_factory=list,
        description="Associated workspace summaries.",
    )


class OrganizationMemberRoleUpdateRequest(BaseSchema):
    role_code: str | None = Field(default=None, min_length=1, max_length=64, description="Target role code.")
    role: OrgRole | None = Field(default=None, description="Built-in role fallback.")

    @model_validator(mode="after")
    def _normalize_role_code(self) -> OrganizationMemberRoleUpdateRequest:
        if self.role_code is None and self.role is not None:
            self.role_code = self.role.value if isinstance(self.role, OrgRole) else str(self.role)
        if not self.role_code:
            raise ValueError("role_code is required")
        return self


class OrganizationMemberInviteRequest(BaseSchema):
    email: str = Field(..., min_length=3, max_length=255, description="Invitee email address.")
    role_code: str | None = Field(default=None, min_length=1, max_length=64, description="Requested role code.")
    role: OrgRole | None = Field(default=None, description="Built-in role fallback.")
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=300,
        le=30 * 24 * 60 * 60,
        description="Invite TTL in seconds.",
    )

    @model_validator(mode="after")
    def _normalize_role_code(self) -> OrganizationMemberInviteRequest:
        if self.role_code is None and self.role is not None:
            self.role_code = self.role.value if isinstance(self.role, OrgRole) else str(self.role)
        if self.role_code is None:
            self.role_code = OrgRole.MEMBER.value
        return self


class OrganizationMemberInviteResult(BaseSchema):
    invitation_id: PublicUUID = Field(..., description="Underlying invitation id.")
    email: str = Field(..., description="Invitee email.")
    role_code: str = Field(..., description="Requested organization role code.")
    token: str = Field(..., description="Signed invite token.")
    invite_url: str | None = Field(default=None, description="Accept invite URL.")


class OrganizationInvitationUserRefOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email address.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class OrganizationInvitationOut(BaseOut):
    invitation_type: str = Field(..., description="Invitation type: email|link.")
    email: str | None = Field(default=None, description="Invitee email (email invite only).")
    display_code: str | None = Field(default=None, description="Display code (link invite only).")
    role_code: str = Field(..., description="Requested organization role code.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")
    created_by_user_id: PublicUUID | None = Field(default=None, description="Inviter user id.")
    created_by: OrganizationInvitationUserRefOut | None = Field(
        default=None,
        description="Inviter user summary.",
    )
    accepted_by_user_id: PublicUUID | None = Field(default=None, description="Accepted by user id.")
    accepted_by: OrganizationInvitationUserRefOut | None = Field(
        default=None,
        description="Accepted by user summary.",
    )
    revoked_by_user_id: PublicUUID | None = Field(default=None, description="Revoked by user id.")
    revoked_by: OrganizationInvitationUserRefOut | None = Field(
        default=None,
        description="Revoked by user summary.",
    )
    accepted_at: datetime | None = Field(default=None, description="Accepted datetime (UTC).")
    revoked_at: datetime | None = Field(default=None, description="Revoked datetime (UTC).")
    status: str = Field(..., description="Invitation status.")
    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class OrganizationInvitationRenewRequest(BaseSchema):
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=300,
        le=30 * 24 * 60 * 60,
        description="New invitation TTL in seconds.",
    )


class OrganizationInvitationRenewResult(BaseSchema):
    invitation: OrganizationInvitationOut = Field(..., description="Renewed invitation.")
    token: str = Field(..., description="Signed invite token.")
    invite_url: str | None = Field(default=None, description="Accept invite URL.")


class OrganizationInvitationRevokeResult(BaseSchema):
    invitation_id: PublicUUID = Field(..., description="Revoked invitation id.")
    revoked: bool = Field(default=True, description="Whether invitation is revoked.")


class OrganizationInviteLinkCreateRequest(BaseSchema):
    role_code: str | None = Field(default=None, min_length=1, max_length=64, description="Role code for this link.")
    expires_in_seconds: int | None = Field(
        default=7 * 24 * 60 * 60,
        ge=300,
        le=30 * 24 * 60 * 60,
        description="Link TTL in seconds.",
    )
    max_uses: int | None = Field(default=None, ge=1, le=100000, description="Max allowed uses.")
    allowed_email_domain: str | None = Field(
        default=None,
        min_length=3,
        max_length=128,
        description="Restrict acceptance email domain.",
    )


class OrganizationInviteLinkOut(BaseOut):
    display_code: str = Field(..., description="UI-safe short code.")
    role_code: str = Field(..., description="Assigned role code.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")
    disabled_at: datetime | None = Field(default=None, description="Disabled datetime (UTC).")
    max_uses: int | None = Field(default=None, description="Max uses; null means unlimited.")
    allowed_email_domain: str | None = Field(default=None, description="Allowed email domain.")
    token: str = Field(..., description="Signed invite token.")
    invite_url: str | None = Field(default=None, description="Accept invite URL.")
    created_by_user_id: PublicUUID | None = Field(default=None, description="Creator user id.")
    created_by: OrganizationInvitationUserRefOut | None = Field(default=None, description="Creator summary.")
    last_used_by_user_id: PublicUUID | None = Field(default=None, description="Last participant user id.")
    last_used_by: OrganizationInvitationUserRefOut | None = Field(default=None, description="Last participant summary.")
    last_used_at: datetime | None = Field(default=None, description="Last used datetime.")
    uses_count: int = Field(default=0, ge=0, description="Times this link has been used.")
    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class OrganizationInviteLinkCreateResult(BaseSchema):
    link: OrganizationInviteLinkOut = Field(..., description="Created link.")
    token: str = Field(..., description="Signed invite token.")
    invite_url: str | None = Field(default=None, description="Accept invite URL.")


class OrganizationInviteLinkRenewResult(BaseSchema):
    link: OrganizationInviteLinkOut = Field(..., description="Renewed link.")
    token: str = Field(..., description="Signed invite token.")
    invite_url: str | None = Field(default=None, description="Accept invite URL.")


class OrganizationInviteLinkParticipantOut(BaseSchema):
    user: OrganizationInvitationUserRefOut = Field(..., description="Participant user summary.")
    used_at: datetime = Field(..., description="Used datetime (UTC).")


class OrganizationMemberDeleteResult(BaseSchema):
    membership_id: PublicUUID = Field(..., description="Deleted membership id.")
    removed: bool = Field(default=True, description="Whether the member was removed.")
