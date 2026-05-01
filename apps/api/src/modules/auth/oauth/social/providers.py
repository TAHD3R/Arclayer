from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

OAuthProviderKind = Literal["google", "github", "microsoft", "discord"]


@dataclass(frozen=True)
class OAuthProviderDefinition:
    key: OAuthProviderKind
    section_id: str
    title: str
    label: str
    icon_key: str
    authorize_url: str
    token_url: str
    userinfo_url: str
    scope: str
    uses_pkce: bool = True
    userinfo_auth_header: str = "authorization"
    userinfo_accept: str | None = None
    prompt: str | None = None


OAUTH_PROVIDER_DEFINITIONS: tuple[OAuthProviderDefinition, ...] = (
    OAuthProviderDefinition(
        key="google",
        section_id="oauth_google",
        title="Google OAuth",
        label="Continue with Google",
        icon_key="google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
        scope="openid email profile",
        prompt="select_account",
    ),
    OAuthProviderDefinition(
        key="github",
        section_id="oauth_github",
        title="GitHub OAuth",
        label="Continue with GitHub",
        icon_key="github",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",
        userinfo_url="https://api.github.com/user",
        scope="read:user user:email",
        userinfo_accept="application/vnd.github+json",
    ),
    OAuthProviderDefinition(
        key="microsoft",
        section_id="oauth_microsoft",
        title="Microsoft OAuth",
        label="Continue with Microsoft",
        icon_key="microsoft",
        authorize_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",
        userinfo_url="https://graph.microsoft.com/oidc/userinfo",
        scope="openid email profile offline_access User.Read",
        prompt="select_account",
    ),
    OAuthProviderDefinition(
        key="discord",
        section_id="oauth_discord",
        title="Discord OAuth",
        label="Continue with Discord",
        icon_key="discord",
        authorize_url="https://discord.com/oauth2/authorize",
        token_url="https://discord.com/api/oauth2/token",
        userinfo_url="https://discord.com/api/users/@me",
        scope="identify email",
    ),
)

OAUTH_PROVIDER_BY_KEY: dict[str, OAuthProviderDefinition] = {item.key: item for item in OAUTH_PROVIDER_DEFINITIONS}


def get_oauth_provider_definition(provider: str) -> OAuthProviderDefinition | None:
    provider_key = (provider or "").strip().lower()
    return OAUTH_PROVIDER_BY_KEY.get(provider_key)
