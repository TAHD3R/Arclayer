from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import AliasChoices, ConfigDict, EmailStr, Field, field_validator, model_validator

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.models.organization import MembershipStatus
from apps.api.routers.v1.auth.constants import PASSWORD_REGEX, RESET_TOKEN_REGEX


class MyOrganizationOut(BaseSchema):
    """Organization membership info for the current user (used by the org picker UI)."""

    organization_id: UUID = Field(..., description="Organization ID.")
    slug: str = Field(..., description="Organization slug.")
    name: str = Field(..., description="Organization name.")
    logo_url: str | None = Field(default=None, description="Organization logo URL.")
    is_active: bool = Field(default=True, description="Whether the organization is active.")

    membership_id: UUID = Field(..., description="Membership ID.")
    membership_status: MembershipStatus = Field(..., description="Membership status.")


class LoginRequest(BaseSchema):
    """Login request."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    username: str = Field(
        min_length=1,
        max_length=255,
        description="Username or email.",
        validation_alias=AliasChoices("username", "identifier"),
    )
    password: str = Field(min_length=1, max_length=128, description="Password.")


class RegisterRequest(BaseSchema):
    """User registration request."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    username: str = Field(
        min_length=6,
        max_length=18,
        description="Username (6-18 chars). Allowed: letters, numbers, underscore, and CJK characters.",
        examples=["john_doe", "user123"],
    )
    email: EmailStr | None = Field(default=None, description="Email address.", examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=128, description="Password (min 8 chars).")
    confirm_password: str = Field(min_length=8, max_length=128, description="Confirm password.")
    display_name: str | None = Field(default=None, max_length=64, description="Display name.")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_\u4e00-\u9fa5]+$", value):
            raise ValueError("Username may only contain letters, numbers, underscore, and CJK characters.")
        return value.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("Password must contain letters and numbers, and be 8-128 characters long.")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if info.data.get("password") and value != info.data["password"]:
            raise ValueError("Confirm password does not match password.")
        return value


class AcceptInvitationRequest(BaseSchema):
    """Accept an invitation and create an account (invite-only registration)."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    token: str = Field(min_length=8, max_length=512, description="Invitation token.")
    email: EmailStr | None = Field(
        default=None,
        description="Email address used for registration (required for invite links that are not email-bound).",
    )
    username: str = Field(
        min_length=6,
        max_length=18,
        description="Username (6-18 chars). Allowed: letters, numbers, underscore, and CJK characters.",
        examples=["john_doe", "user123"],
    )
    password: str = Field(min_length=8, max_length=128, description="Password (min 8 chars).")
    confirm_password: str = Field(min_length=8, max_length=128, description="Confirm password.")
    display_name: str | None = Field(default=None, max_length=64, description="Display name.")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_\u4e00-\u9fa5]+$", value):
            raise ValueError("Username may only contain letters, numbers, underscore, and CJK characters.")
        return value.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("Password must contain letters and numbers, and be 8-128 characters long.")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if info.data.get("password") and value != info.data["password"]:
            raise ValueError("Confirm password does not match password.")
        return value


class RefreshRequest(BaseSchema):
    """Refresh token request."""

    refresh_token: str = Field(min_length=1, description="Refresh token.")


class LogoutRequest(BaseSchema):
    """Logout request."""

    refresh_token: str | None = None


class ChangePasswordRequest(BaseSchema):
    """Change password request."""

    old_password: str = Field(min_length=1, max_length=128, description="Current password.")
    new_password: str = Field(min_length=8, max_length=128, description="New password.")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("New password must contain letters and numbers, and be 8-128 characters long.")
        return value

    @model_validator(mode="after")
    def validate_not_same(self):
        if self.old_password == self.new_password:
            raise ValueError("New password must be different from the current password.")
        return self


class ForgotPasswordRequest(BaseSchema):
    """Forgot password request."""

    identifier: str = Field(min_length=1, description="Username or email.")


class ResetPasswordRequest(BaseSchema):
    """Reset password request."""

    reset_token: str = Field(min_length=1, description="Reset token.")
    new_password: str = Field(min_length=8, max_length=128, description="New password.")

    @field_validator("reset_token")
    @classmethod
    def validate_reset_token(cls, value: str) -> str:
        if not re.match(RESET_TOKEN_REGEX, value):
            raise ValueError("Invalid reset token format.")
        return value

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("New password must contain letters and numbers, and be 8-128 characters long.")
        return value


class TokenPair(BaseSchema):
    """Token pair response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class ResetTokenPayload(BaseSchema):
    """Reset token payload."""

    reset_token: str
    expires_in: int


class UserProfile(BaseOut):
    """User profile response."""

    username: str
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None


class InvitationPreviewInvitationOut(BaseSchema):
    """Invitation summary for public preview."""

    email: str | None = Field(default=None, description="Invited email address (nullable for invite links).")
    masked_email: str | None = Field(default=None, description="Masked email for safe display (nullable).")
    role_code: str | None = Field(default=None, description="Role code to assign when accepted.")
    expires_at: datetime | None = Field(default=None, description="Invitation expiry datetime (UTC).")


class InvitationPreviewOrganizationOut(BaseSchema):
    """Organization info for invitation preview."""

    id: UUID = Field(..., description="Organization id.")
    name: str = Field(..., description="Organization name.")
    slug: str = Field(..., description="Organization slug.")
    logo_url: str | None = Field(default=None, description="Organization logo url.")


class InvitationPreviewInviterOut(BaseSchema):
    """Inviter user info for invitation preview."""

    id: UUID = Field(..., description="Inviter user id.")
    username: str = Field(..., description="Inviter username.")
    display_name: str | None = Field(default=None, description="Inviter display name.")
    avatar_url: str | None = Field(default=None, description="Inviter avatar url.")


class InvitationPreviewRoleOut(BaseSchema):
    """Role semantic info for invitation preview."""

    code: str = Field(..., description="Role code.")
    name: str = Field(..., description="Role display name.")
    description: str | None = Field(default=None, description="Role description.")


class InvitationPreviewResult(BaseSchema):
    """Invitation preview response used by the accept-invite wizard."""

    invitation: InvitationPreviewInvitationOut
    organization: InvitationPreviewOrganizationOut
    inviter: InvitationPreviewInviterOut | None = Field(default=None, description="Inviter info (nullable).")
    role: InvitationPreviewRoleOut
    user_exists: bool = Field(default=False, description="Whether the invited email already has an account.")


class MyInvitationOrganizationOut(BaseSchema):
    """Organization info for 'my invitations' listing."""

    id: UUID = Field(..., description="Organization id.")
    name: str = Field(..., description="Organization name.")
    slug: str = Field(..., description="Organization slug.")
    logo_url: str | None = Field(default=None, description="Organization logo url.")


class MyInvitationInviterOut(BaseSchema):
    """Inviter user summary for 'my invitations' listing."""

    id: UUID = Field(..., description="Inviter user id.")
    username: str = Field(..., description="Inviter username.")
    email: str | None = Field(default=None, description="Inviter email.")
    display_name: str | None = Field(default=None, description="Inviter display name.")
    avatar_url: str | None = Field(default=None, description="Inviter avatar url.")


class MyInvitationOut(BaseOut):
    """Invitation record visible to the current user (bound by email)."""

    email: str = Field(..., description="Invited email address (should match current user's email).")
    role_code: str | None = Field(default=None, description="Role code assigned when accepted.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")

    organization: MyInvitationOrganizationOut = Field(..., description="Target organization.")
    inviter: MyInvitationInviterOut | None = Field(default=None, description="Inviter summary (if available).")

    status: str = Field(..., description="Invitation status: pending/accepted.")
    accepted_at: datetime | None = Field(default=None, description="Accepted datetime (UTC).")

    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class MyInvitationListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (organization/role).")
    status: str | None = Field(default=None, description="Filter by status: pending/accepted.")


class AcceptExistingInvitationRequest(BaseSchema):
    """Accept an invitation with an existing logged-in account (email-bound)."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    token: str = Field(min_length=8, max_length=512, description="Invitation token.")


class AcceptExistingInvitationResult(BaseSchema):
    """Result for accepting an invitation with an existing account."""

    organization_id: UUID = Field(..., description="Organization id that the user joined.")
    role_code: str | None = Field(default=None, description="Role code assigned by the invitation.")
