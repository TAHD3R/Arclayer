from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.models.user import UserStatus


class AdminUserSummaryOut(BaseOut):
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email.")
    status: UserStatus = Field(..., description="User status.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")
    avatar_asset_id: UUID | None = Field(default=None, description="Avatar asset id.")
    last_login_at: datetime | None = Field(default=None, description="Last login time.")


class AdminUserDetailOut(AdminUserSummaryOut):
    token_version: int = Field(..., description="Token version for revocation.")


class AdminUserListQuery(BaseSchema):
    q: str | None = Field(default=None, description="Search query for username/email/display_name.")
    status: UserStatus | None = Field(default=None, description="Filter by user status.")
    role_code: str | None = Field(default=None, description="Filter by role code (effective assignment not expanded).")
    ordering: str | None = Field(default=None, description="Ordering, e.g. '-created_at', 'username'.")


class AdminUserCreateRequest(BaseSchema):
    username: str = Field(..., min_length=1, max_length=64, description="Username.")
    email: str | None = Field(default=None, max_length=255, description="Email.")
    display_name: str | None = Field(default=None, max_length=64, description="Display name.")
    password: str = Field(..., min_length=8, max_length=128, description="Initial password.")


class AdminUserUpdateRequest(BaseSchema):
    email: str | None = Field(default=None, max_length=255, description="Email.")
    display_name: str | None = Field(default=None, max_length=64, description="Display name.")
    avatar_url: str | None = Field(default=None, max_length=512, description="Avatar URL.")
    avatar_asset_id: UUID | None = Field(default=None, description="Avatar asset id.")


class AdminResetPasswordRequest(BaseSchema):
    new_password: str = Field(..., min_length=8, max_length=128, description="New password.")
