from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class AuthSSOProviderItem(BaseSchema):
    provider: str = Field(..., description="Provider identifier (e.g. google, github).")
    label: str = Field(..., description="Human-readable label for the login button.")
    start_url: str = Field(..., description="Full URL to start the OAuth/SSO flow (browser navigation).")
    icon_key: str | None = Field(default=None, description="Optional icon key for frontend mapping.")


class AuthSSOProvidersOut(BaseSchema):
    providers: list[AuthSSOProviderItem] = Field(default_factory=list, description="Enabled SSO providers.")


class AuthSSOExchangeIn(BaseSchema):
    code: str = Field(..., min_length=8, max_length=512, description="One-time exchange code.")
