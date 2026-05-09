from __future__ import annotations

import re
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from src.common.constants.auth import PASSWORD_REGEX
from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.organization.user import UserStatus
from src.models.workspaces.workspace import WorkspaceIconMode


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


class DirectoryWorkspaceListItemOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    name: str = Field(..., description="Workspace name.")
    description: str | None = Field(default=None, description="Workspace description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Workspace icon mode.")
    icon_color: str | None = Field(default=None, description="Workspace icon color.")
    icon_glyph: str | None = Field(default=None, description="Workspace icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Workspace icon emoji.")
    icon_url: str | None = Field(default=None, description="Workspace icon URL.")
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
    name: str = Field(..., description="Project name.")
    slug: str = Field(..., description="Project slug.")
    description: str | None = Field(default=None, description="Project description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Project icon mode.")
    icon_color: str | None = Field(default=None, description="Project icon color.")
    icon_glyph: str | None = Field(default=None, description="Project icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, description="Project icon URL.")
    is_active: bool = Field(default=True, description="Whether the project is active.")
    created_at: datetime = Field(..., description="Created at.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Project member count.")


class DirectoryUserDetailOut(DirectoryUserListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")


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


class DirectoryWorkspaceListFilters(BaseSchema):
    is_archived: bool | None = Field(default=None, description="Workspace archive state filter.")
    is_active: bool | None = Field(default=None, description="Workspace active state filter.")


class DirectoryProjectListFilters(BaseSchema):
    workspace_id: PublicUUID | None = Field(default=None, description="Workspace id filter.")
    is_active: bool | None = Field(default=None, description="Project active state filter.")


class DirectoryWorkspaceUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Workspace name.")
    description: str | None = Field(default=None, max_length=256, description="Workspace description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Workspace icon presentation mode.")
    icon_color: str | None = Field(default=None, max_length=16, description="Workspace icon background color.")
    icon_glyph: str | None = Field(default=None, max_length=64, description="Workspace icon glyph id.")
    icon_emoji: str | None = Field(default=None, max_length=32, description="Workspace icon emoji.")
    icon_url: str | None = Field(default=None, max_length=1024, description="Workspace icon URL.")

    @field_validator("name")
    @classmethod
    def normalize_workspace_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Workspace name is required.")
        return normalized

    @field_validator("description", "icon_color", "icon_glyph", "icon_emoji", "icon_url")
    @classmethod
    def normalize_optional_string(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DirectoryProjectUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Project name.")
    slug: str | None = Field(default=None, min_length=1, max_length=64, description="Project slug.")
    description: str | None = Field(default=None, max_length=256, description="Project description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Project icon presentation mode.")
    icon_color: str | None = Field(default=None, max_length=16, description="Project icon background color.")
    icon_glyph: str | None = Field(default=None, max_length=64, description="Project icon glyph id.")
    icon_emoji: str | None = Field(default=None, max_length=32, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, max_length=1024, description="Project icon URL.")

    @field_validator("name", "slug")
    @classmethod
    def normalize_project_required_optional_string(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value is required.")
        return normalized

    @field_validator("description", "icon_color", "icon_glyph", "icon_emoji", "icon_url")
    @classmethod
    def normalize_project_optional_string(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DirectoryDeleteRequest(BaseSchema):
    confirm_name: str = Field(
        min_length=1,
        max_length=128,
        description="Current entity name confirmation for destructive delete.",
        validation_alias="confirmName",
    )

    @field_validator("confirm_name")
    @classmethod
    def normalize_confirm_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value is required.")
        return normalized
