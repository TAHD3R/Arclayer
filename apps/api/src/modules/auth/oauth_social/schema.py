from __future__ import annotations

from datetime import datetime

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema


class OAuthStatePayload(BaseSchema):
    provider: str = Field(..., description="Provider name.")
    redirect: str | None = Field(default=None, description="Optional frontend redirect path.")
    code_verifier: str = Field(..., description="PKCE code verifier.")
    link_user_id: str | None = Field(default=None, description="Optional user id for account linking flow.")


class OAuthLinkedIdentityOut(BaseSchema):
    provider: str = Field(..., description="Provider identifier (e.g. google, github).")
    email: str | None = Field(default=None, description="Best-effort identity email for diagnostics.")
    created_at: datetime = Field(..., description="Created time (UTC).")


class OAuthLinkedIdentityListOut(BaseSchema):
    identities: list[OAuthLinkedIdentityOut] = Field(default_factory=list, description="Linked OAuth identities.")


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
