from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseSchema


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
