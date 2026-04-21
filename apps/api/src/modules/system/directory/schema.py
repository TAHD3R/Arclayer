from __future__ import annotations

import re
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from src.common.constants.auth import PASSWORD_REGEX
from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.organization.organization import OrganizationKind
from src.models.organization.user import UserStatus


class DirectoryActorSummaryOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class DirectoryUserListItemOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")
    status: UserStatus = Field(..., description="User status.")
    is_super_admin: bool = Field(default=False, description="Whether the user is a super admin.")
    has_password: bool = Field(default=False, description="Whether a local password is configured.")
    two_factor_enabled: bool = Field(default=False, description="Whether two-factor authentication is enabled.")
    linked_oauth_providers: list[str] = Field(
        default_factory=list,
        description="Linked OAuth providers for the account.",
    )
    last_login_at: datetime | None = Field(default=None, description="Last login time.")
    created_at: datetime = Field(..., description="Created at.")
    owned_organizations_count: int = Field(default=0, ge=0, description="Organizations owned by the user.")
    organization_membership_count: int = Field(
        default=0,
        ge=0,
        description="Active organization memberships for the user.",
    )
    workspace_membership_count: int = Field(
        default=0,
        ge=0,
        description="Active workspace memberships for the user.",
    )
    project_membership_count: int = Field(
        default=0,
        ge=0,
        description="Project memberships for the user.",
    )


class DirectoryOrganizationListItemOut(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    name: str = Field(..., description="Organization name.")
    slug: str = Field(..., description="Organization slug.")
    kind: OrganizationKind = Field(..., description="Organization kind.")
    is_active: bool = Field(default=True, description="Whether the organization is active.")
    created_at: datetime = Field(..., description="Created at.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    workspace_count: int = Field(default=0, ge=0, description="Workspace count.")
    project_count: int = Field(default=0, ge=0, description="Project count.")


class DirectoryWorkspaceListItemOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    organization_name: str = Field(..., description="Organization name.")
    name: str = Field(..., description="Workspace name.")
    description: str | None = Field(default=None, description="Workspace description.")
    is_active: bool = Field(default=True, description="Whether the workspace is active.")
    is_archived: bool = Field(default=False, description="Whether the workspace is archived.")
    created_at: datetime = Field(..., description="Created at.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    project_count: int = Field(default=0, ge=0, description="Project count.")


class DirectoryProjectListItemOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    workspace_name: str = Field(..., description="Workspace name.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    organization_name: str = Field(..., description="Organization name.")
    name: str = Field(..., description="Project name.")
    slug: str = Field(..., description="Project slug.")
    description: str | None = Field(default=None, description="Project description.")
    is_active: bool = Field(default=True, description="Whether the project is active.")
    created_at: datetime = Field(..., description="Created at.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Project member count.")


class DirectoryUserDetailOut(DirectoryUserListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")


class DirectoryOrganizationDetailOut(DirectoryOrganizationListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")
    logo_url: str | None = Field(default=None, description="Organization logo URL.")


class DirectoryWorkspaceDetailOut(DirectoryWorkspaceListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")
    kind: str = Field(..., description="Workspace kind.")
    icon_mode: str = Field(..., description="Workspace icon mode.")
    icon_color: str = Field(..., description="Workspace icon color.")
    icon_glyph: str | None = Field(default=None, description="Workspace icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Workspace icon emoji.")
    icon_url: str | None = Field(default=None, description="Workspace icon URL.")


class DirectoryProjectDetailOut(DirectoryProjectListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")
    icon_mode: str = Field(..., description="Project icon mode.")
    icon_color: str = Field(..., description="Project icon color.")
    icon_glyph: str | None = Field(default=None, description="Project icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, description="Project icon URL.")


class DirectoryUserUpdateRequest(BaseSchema):
    email: EmailStr | None = Field(default=None, description="Email address.")
    display_name: str | None = Field(default=None, max_length=64, description="Display name.")
    avatar_asset_id: PublicUUID | None = Field(
        default=None,
        description="Avatar asset id.",
        validation_alias="avatarAssetId",
    )

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DirectoryUserResetPasswordRequest(BaseSchema):
    new_password: str = Field(min_length=8, max_length=128, description="New password.")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("New password must contain letters and numbers, and be 8-128 characters long.")
        return value


class DirectoryUserListFilters(BaseSchema):
    status: UserStatus | None = Field(default=None, description="Account status filter.")
    is_super_admin: bool | None = Field(default=None, description="Super admin permission filter.")
    has_password: bool | None = Field(default=None, description="Local password filter.")
    two_factor_enabled: bool | None = Field(default=None, description="Two-factor authentication filter.")
    oauth_provider: str | None = Field(default=None, description="OAuth provider filter.")

    @field_validator("oauth_provider")
    @classmethod
    def normalize_oauth_provider(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None
