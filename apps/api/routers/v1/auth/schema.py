from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class UserProfile(BaseModel):
    id: UUID
    username: str
    email: str | None = None
    phone: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
