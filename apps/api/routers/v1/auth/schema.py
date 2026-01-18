from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class LoginRequest(BaseSchema):
    identifier: str = Field(min_length=1)
    password: str = Field(min_length=1)


class RegisterRequest(BaseSchema):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    display_name: str | None = Field(default=None, max_length=64)


class RefreshRequest(BaseSchema):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseSchema):
    refresh_token: str | None = None


class ChangePasswordRequest(BaseSchema):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseSchema):
    identifier: str = Field(min_length=1)


class ResetPasswordRequest(BaseSchema):
    reset_token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class TokenPair(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class ResetTokenPayload(BaseSchema):
    reset_token: str
    expires_in: int


class UserProfile(BaseOut):
    username: str
    email: str | None = None
    phone: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
