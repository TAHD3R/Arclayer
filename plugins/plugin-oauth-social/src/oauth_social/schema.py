from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class OAuthStatePayload(BaseSchema):
    provider: str = Field(..., description="Provider name.")
    redirect: str | None = Field(default=None, description="Optional frontend redirect path.")
    code_verifier: str = Field(..., description="PKCE code verifier.")


class OAuthExchangePayload(BaseSchema):
    user_id: str = Field(..., description="User id (UUID string).")
    redirect: str | None = Field(default=None, description="Optional frontend redirect path.")


class GoogleUserInfo(BaseSchema):
    sub: str
    email: str | None = None
    email_verified: bool | None = None
    name: str | None = None
    picture: str | None = None


class GitHubUser(BaseSchema):
    id: int
    login: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class GitHubEmailItem(BaseSchema):
    email: str
    primary: bool | None = None
    verified: bool | None = None
    visibility: str | None = None

