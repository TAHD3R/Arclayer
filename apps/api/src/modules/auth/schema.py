from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, ConfigDict, EmailStr, Field, field_validator, model_validator

from src.common.constants.auth import PASSWORD_REGEX, RESET_TOKEN_REGEX
from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID

ACCOUNT_NAME_REGEX = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DISPLAY_NAME_REGEX = re.compile(r"^[a-zA-Z0-9_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5 ._-]*$")


def _normalize_account_name(value: str) -> str:
    normalized = value.strip().lower()
    if not ACCOUNT_NAME_REGEX.fullmatch(normalized):
        raise ValueError("Account name may only contain lowercase letters, numbers, and hyphens.")
    return normalized


def _normalize_display_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if not DISPLAY_NAME_REGEX.fullmatch(normalized):
        raise ValueError(
            "Display name may only contain letters, numbers, underscore, CJK characters, space, dot and hyphen."
        )
    return normalized


class LoginRequest(BaseSchema):
    """Login request."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    email: EmailStr = Field(description="Email address.")
    password: str = Field(min_length=1, max_length=128, description="Password.")


class LoginEmailCodeRequest(BaseSchema):
    """Request a login code by email."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    email: EmailStr = Field(description="Email address.")


class LoginEmailCodeRequestOut(BaseSchema):
    """Login code request metadata."""

    expires_in: int = Field(ge=1, description="Code expires in seconds.")
    retry_after: int = Field(ge=0, description="Seconds before the code can be resent.")


class LoginEmailCodeVerifyRequest(BaseSchema):
    """Verify a login code by email."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    email: EmailStr = Field(description="Email address.")
    code: str = Field(min_length=4, max_length=16, description="Email login verification code.")


class EmailCheckRequest(BaseSchema):
    """Email existence precheck request."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    email: EmailStr = Field(description="Email address.")


class EmailCheckOut(BaseSchema):
    """Email existence precheck result."""

    exists: bool = Field(description="Whether an account already exists for the email address.")
    password_login_available: bool = Field(
        description="Whether the account can continue with password login.",
    )


class UsernameCheckRequest(BaseSchema):
    """Username availability precheck request."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    username: str = Field(
        min_length=3,
        max_length=32,
        description="Account name (3-32 chars). Allowed: lowercase letters, numbers, and hyphens.",
    )

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return _normalize_account_name(value)


class UsernameCheckOut(BaseSchema):
    """Username availability precheck result."""

    available: bool = Field(description="Whether the account name is currently available.")


class RegisterRequest(BaseSchema):
    """User registration request."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    email: EmailStr = Field(description="Email address.", examples=["user@example.com"])
    password: str = Field(min_length=8, max_length=128, description="Password (min 8 chars).")
    display_name: str | None = Field(default=None, max_length=64, description="Display name.")

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str | None) -> str | None:
        return _normalize_display_name(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("Password must contain letters and numbers, and be 8-128 characters long.")
        return value


class RegisterEmailResendRequest(BaseSchema):
    """Resend public-registration verification email."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    email: EmailStr = Field(description="Email address used during registration.")


class RegisterEmailVerificationRequest(BaseSchema):
    """Confirm public-registration email verification token."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    token: str = Field(min_length=16, max_length=256, description="Email verification token.")


class RegisterEmailVerificationOut(BaseSchema):
    """Confirmed registration email verification result."""

    email: EmailStr = Field(description="Verified email address.")


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


class SetMyPasswordRequest(BaseSchema):
    """Set password for current user (OAuth-only accounts)."""

    new_password: str = Field(min_length=8, max_length=128, description="New password.")
    code: str | None = Field(default=None, min_length=4, max_length=16, description="2FA TOTP code.")
    backup_code: str | None = Field(default=None, min_length=4, max_length=64, description="2FA backup code.")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("New password must contain letters and numbers, and be 8-128 characters long.")
        return value

    @model_validator(mode="after")
    def validate_reauth_shape(self):
        has_totp = bool(self.code and self.code.strip())
        has_backup = bool(self.backup_code and self.backup_code.strip())
        if has_totp and has_backup:
            raise ValueError("Provide exactly one of code or backup_code.")
        return self


class ForgotPasswordRequest(BaseSchema):
    """Forgot password request."""

    email: EmailStr = Field(description="Email address.")


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
    avatar_asset_id: PublicUUID | None = None
    avatar_asset_aligned: bool = Field(
        default=False,
        description="Whether the avatar asset was auto-aligned (purpose/visibility/indexable) in this response.",
    )
    is_super_admin: bool = False


class RegisterResult(BaseSchema):
    """Registration result and optional email verification metadata."""

    user: UserProfile
    requires_email_verification: bool = Field(
        default=False,
        description="Whether the user must verify their email before signing in.",
    )
    expires_in: int | None = Field(default=None, ge=1, description="Verification link TTL in seconds.")
    retry_after: int | None = Field(default=None, ge=0, description="Seconds before the link can be resent.")


OnboardingJobRole = Literal[
    "content_manager",
    "website_manager",
    "marketing_lead",
    "founder_owner",
    "developer_builder",
    "product_manager",
    "ai_operations",
    "agency_partner",
    "other",
]

OnboardingCompanySize = Literal["solo", "2_10", "11_50", "51_200", "201_1000", "1001_plus"]

OnboardingHeardAboutUs = Literal[
    "search",
    "social",
    "referral",
    "community_event",
    "article_newsletter",
    "ai_directory",
    "agency_consultant",
    "other",
]


class OnboardingProfileOut(BaseSchema):
    """Current user's onboarding profile signals."""

    job_role: OnboardingJobRole | None = None
    company_size: OnboardingCompanySize | None = None
    subscribed_product_updates: bool = True
    heard_about_us: OnboardingHeardAboutUs | None = None


class OnboardingProfilePatchRequest(BaseSchema):
    """Patch current user's onboarding profile signals."""

    job_role: OnboardingJobRole | None = None
    company_size: OnboardingCompanySize | None = None
    subscribed_product_updates: bool | None = None
    heard_about_us: OnboardingHeardAboutUs | None = None


class UpdateMyProfileRequest(BaseSchema):
    """Update current user profile request."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    display_name: str | None = Field(default=None, max_length=64, description="Display name.")
    avatar_asset_id: PublicUUID | None = Field(
        default=None,
        description="Avatar asset id (optional).",
        validation_alias=AliasChoices("avatar_asset_id", "avatarAssetId"),
    )

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        return _normalize_display_name(value)


class AvatarUploadInitRequest(BaseSchema):
    """Initialize avatar upload (current user only)."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    filename: str = Field(..., min_length=1, max_length=255, description="Original file name.")
    mime: str | None = Field(default=None, max_length=128, description="Client-provided MIME type.")
    size_bytes: int = Field(..., ge=0, description="Total size in bytes.")
    expected_sha256: str | None = Field(default=None, min_length=64, max_length=64, description="Expected SHA-256.")


class RequestMyEmailChangeRequest(BaseSchema):
    """Request email change verification code."""

    new_email: EmailStr = Field(..., description="New email address.")


class RequestMyEmailChangeOut(BaseSchema):
    """Email change request response."""

    expires_in: int = Field(..., ge=1, description="Code expires in seconds.")
    retry_after: int = Field(..., ge=0, description="Seconds before another code can be sent.")


class MySecurityCapabilityOut(BaseSchema):
    """Security capabilities for current account."""

    has_password: bool = Field(default=False, description="Whether the account already has a local password.")
    two_factor_enabled: bool = Field(default=False, description="Whether TOTP 2FA is enabled.")
    has_linked_oauth_identities: bool = Field(
        default=False,
        description="Whether the account has linked OAuth identities available for sign-in.",
    )
    set_password_required_reauth_methods: list[str] = Field(
        default_factory=list,
        description="Required re-auth method(s) to set password: 2fa or relogin.",
    )
    email_change_required_reauth_methods: list[str] = Field(
        default_factory=list,
        description="Required re-auth method(s) to confirm email change: password, 2fa, or relogin.",
    )


class ConfirmMyEmailChangeRequest(BaseSchema):
    """Confirm email change."""

    new_email: EmailStr = Field(..., description="New email address.")
    code: str = Field(min_length=4, max_length=16, description="Email verification code.")


class RequestRemoveMyPasswordRequest(BaseSchema):
    """Request a verification code before removing the current password."""

    current_password: str = Field(min_length=1, max_length=128, description="Current password.")


class RequestRemoveMyPasswordOut(BaseSchema):
    """Password-removal request response."""

    expires_in: int = Field(..., ge=1, description="Code expires in seconds.")
    retry_after: int = Field(..., ge=0, description="Seconds before another code can be sent.")


class ConfirmRemoveMyPasswordRequest(BaseSchema):
    """Confirm password removal."""

    code: str = Field(min_length=4, max_length=16, description="Email verification code.")


class DeleteMyAccountRequest(BaseSchema):
    """Delete (or anonymize) current account."""

    email: EmailStr = Field(..., description="Current account email for confirmation.")
    password: str | None = Field(default=None, min_length=1, max_length=128, description="Current password.")
    code: str | None = Field(default=None, min_length=4, max_length=16, description="2FA TOTP code (SSO-only).")
    backup_code: str | None = Field(
        default=None, min_length=4, max_length=64, description="2FA backup code (SSO-only)."
    )

    @model_validator(mode="after")
    def _validate_reauth_shape(self):
        has_password = bool(self.password and self.password.strip())
        has_totp = bool(self.code and self.code.strip())
        has_backup = bool(self.backup_code and self.backup_code.strip())
        if has_totp and has_backup:
            raise ValueError("Provide exactly one of code or backup_code.")
        if has_password and (has_totp or has_backup):
            raise ValueError("Provide either password or 2FA code, not both.")
        return self


class DeleteMyAccountCapabilityOut(BaseSchema):
    """Delete-account capabilities for the current user."""

    email: EmailStr | None = Field(default=None, description="Current account email if available.")
    can_delete: bool = Field(default=False, description="Whether account deletion is currently allowed.")
    blocked_reason: str | None = Field(
        default=None, description="Explicit blocking reason code when deletion is not allowed."
    )
    required_reauth_methods: list[str] = Field(
        default_factory=list,
        description="Required re-auth method(s): password, 2fa, or relogin.",
    )
    has_password: bool = Field(default=False, description="Whether the account has a local password credential.")
    two_factor_enabled: bool = Field(default=False, description="Whether TOTP 2FA is enabled.")
    has_linked_oauth_identities: bool = Field(
        default=False,
        description="Whether the account has linked OAuth identities available for sign-in.",
    )


class InvitationPreviewInvitationOut(BaseSchema):
    """Invitation summary for public preview."""

    email: str | None = Field(default=None, description="Invited email address (nullable for invite links).")
    masked_email: str | None = Field(default=None, description="Masked email for safe display (nullable).")
    role_code: str | None = Field(default=None, description="Role code to assign when accepted.")
    expires_at: datetime | None = Field(default=None, description="Invitation expiry datetime (UTC).")


class InvitationPreviewWorkspaceOut(BaseSchema):
    """Workspace info for invitation preview (v2)."""

    id: PublicUUID = Field(..., description="Workspace id.")
    name: str = Field(..., description="Workspace name.")
    logo_url: str | None = Field(default=None, description="Workspace logo url.")


class InvitationPreviewInviterOut(BaseSchema):
    """Inviter user info for invitation preview."""

    id: PublicUUID = Field(..., description="Inviter user id.")
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
    workspace: InvitationPreviewWorkspaceOut = Field(..., description="Target workspace for the invitation.")
    inviter: InvitationPreviewInviterOut | None = Field(default=None, description="Inviter info (nullable).")
    role: InvitationPreviewRoleOut | None = Field(default=None, description="Role semantic info (nullable).")
    user_exists: bool = Field(default=False, description="Whether the invited email already has an account.")


class MyInvitationWorkspaceOut(BaseSchema):
    """Workspace info for 'my invitations' listing (v2)."""

    id: PublicUUID = Field(..., description="Workspace id.")
    name: str = Field(..., description="Workspace name.")
    logo_url: str | None = Field(default=None, description="Workspace logo url.")


class MyInvitationInviterOut(BaseSchema):
    """Inviter user summary for 'my invitations' listing."""

    id: PublicUUID = Field(..., description="Inviter user id.")
    username: str = Field(..., description="Inviter username.")
    email: str | None = Field(default=None, description="Inviter email.")
    display_name: str | None = Field(default=None, description="Inviter display name.")
    avatar_url: str | None = Field(default=None, description="Inviter avatar url.")


class MyInvitationOut(BaseOut):
    """Invitation record visible to the current user (bound by email)."""

    email: str = Field(..., description="Invited email address (should match current user's email).")
    role_code: str | None = Field(default=None, description="Role code assigned when accepted.")
    expires_at: datetime | None = Field(default=None, description="Expiration datetime (UTC).")

    workspace: MyInvitationWorkspaceOut = Field(..., description="Target workspace for the invitation.")
    inviter: MyInvitationInviterOut | None = Field(default=None, description="Inviter summary (if available).")

    status: str = Field(..., description="Invitation status: pending/accepted.")
    accepted_at: datetime | None = Field(default=None, description="Accepted datetime (UTC).")

    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class MyInvitationListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query (workspace/role).")
    status: str | None = Field(default=None, description="Filter by status: pending/accepted.")


class AcceptExistingInvitationRequest(BaseSchema):
    """Accept an invitation with an existing logged-in account (email-bound)."""

    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)

    token: str = Field(min_length=8, max_length=512, description="Invitation token.")


class AcceptExistingInvitationResult(BaseSchema):
    """Result for accepting an invitation with an existing account."""

    workspace_id: PublicUUID | None = Field(
        default=None,
        description="Workspace id that the user joined.",
    )
    project_id: PublicUUID | None = Field(
        default=None,
        description="Primary project id for the joined workspace.",
    )
    role_code: str | None = Field(default=None, description="Role code assigned by the invitation.")
