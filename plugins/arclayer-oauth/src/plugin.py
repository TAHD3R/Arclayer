"""Official OAuth provider Connector collection."""

from __future__ import annotations

from urllib.parse import urlencode

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from src.core.connectors import (
    ConnectorAdminMetadata,
    ConnectorDefinition,
    ConnectorKind,
    ConnectorTrustLevel,
)
from src.core.logging import get_logger
from src.core.registries import PluginRegistry
from src.modules.auth.oauth.social.providers import OAuthProviderDefinition, OAuthProviderProfile

logger = get_logger(__name__)

_EXTENSION_NAME = "arclayer-oauth"


class _GoogleUserInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sub: str
    email: str | None = None
    email_verified: bool = False
    name: str | None = None
    picture: str | None = None


class _GitHubUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int
    login: str
    name: str | None = None
    avatar_url: str | None = None


class _GitHubEmail(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: str
    primary: bool = False
    verified: bool = False


class _MicrosoftUserInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sub: str
    email: str | None = None
    preferred_username: str | None = None
    name: str | None = None


class _DiscordUser(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    global_name: str | None = None
    avatar: str | None = None
    email: str | None = None
    verified: bool = False


class _OAuthUpstream(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    definition: OAuthProviderDefinition
    authorize_url: str
    token_url: str
    userinfo_url: str
    scope: str
    uses_pkce: bool = True
    userinfo_accept: str | None = None
    prompt: str | None = None
    access_type: str | None = None


_OAuthUpstream.model_rebuild(_types_namespace={"OAuthProviderDefinition": OAuthProviderDefinition})


class OfficialOAuthProviderConnector:
    def __init__(self, upstream: _OAuthUpstream) -> None:
        self._upstream = upstream
        self.definition = upstream.definition

    def build_authorize_url(
        self,
        *,
        client_id: str,
        redirect_uri: str,
        state: str,
        code_challenge: str,
    ) -> str:
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": self._upstream.scope,
            "state": state,
        }
        if self._upstream.uses_pkce:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        if self._upstream.prompt:
            params["prompt"] = self._upstream.prompt
        if self._upstream.access_type:
            params["access_type"] = self._upstream.access_type
        return f"{self._upstream.authorize_url}?{urlencode(params)}"

    async def exchange_access_token(
        self,
        *,
        client: httpx.AsyncClient,
        client_id: str,
        client_secret: str,
        code: str,
        code_verifier: str,
        redirect_uri: str,
    ) -> str:
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
        if self._upstream.uses_pkce:
            data["code_verifier"] = code_verifier
        response = await client.post(
            self._upstream.token_url,
            data=data,
            headers={"accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        access_token = payload.get("access_token") if isinstance(payload, dict) else None
        if not isinstance(access_token, str) or not access_token:
            raise ValueError("OAuth token response did not include access_token")
        return access_token

    async def fetch_profile(
        self,
        *,
        client: httpx.AsyncClient,
        access_token: str,
    ) -> OAuthProviderProfile:
        headers = {"authorization": f"Bearer {access_token}"}
        if self._upstream.userinfo_accept:
            headers["accept"] = self._upstream.userinfo_accept
        response = await client.get(self._upstream.userinfo_url, headers=headers)
        response.raise_for_status()
        payload = response.json()
        if self.definition.key == "google":
            return self._google_profile(payload)
        if self.definition.key == "microsoft":
            return self._microsoft_profile(payload)
        if self.definition.key == "discord":
            return self._discord_profile(payload)
        return await self._github_profile(client=client, access_token=access_token, payload=payload)

    @staticmethod
    def _google_profile(payload: object) -> OAuthProviderProfile:
        info = _GoogleUserInfo.model_validate(payload)
        return OAuthProviderProfile(
            subject=info.sub,
            email=(info.email or "").strip().lower() or None,
            email_verified=bool(info.email_verified),
            display_name=info.name,
            avatar_url=info.picture,
        )

    @staticmethod
    def _microsoft_profile(payload: object) -> OAuthProviderProfile:
        info = _MicrosoftUserInfo.model_validate(payload)
        email = (info.email or info.preferred_username or "").strip().lower() or None
        return OAuthProviderProfile(
            subject=info.sub,
            email=email,
            email_verified=bool(email),
            display_name=info.name,
        )

    @staticmethod
    def _discord_profile(payload: object) -> OAuthProviderProfile:
        info = _DiscordUser.model_validate(payload)
        avatar_url = f"https://cdn.discordapp.com/avatars/{info.id}/{info.avatar}.png" if info.avatar else None
        return OAuthProviderProfile(
            subject=info.id,
            email=(info.email or "").strip().lower() or None,
            email_verified=bool(info.verified),
            display_name=info.global_name or info.username,
            avatar_url=avatar_url,
        )

    @staticmethod
    async def _github_profile(
        *,
        client: httpx.AsyncClient,
        access_token: str,
        payload: object,
    ) -> OAuthProviderProfile:
        user = _GitHubUser.model_validate(payload)
        response = await client.get(
            "https://api.github.com/user/emails",
            headers={
                "authorization": f"Bearer {access_token}",
                "accept": "application/vnd.github+json",
            },
        )
        response.raise_for_status()
        emails = []
        raw_emails = response.json()
        if isinstance(raw_emails, list):
            for row in raw_emails:
                try:
                    emails.append(_GitHubEmail.model_validate(row))
                except ValidationError:
                    continue
        chosen = next((item for item in emails if item.primary and item.verified), None)
        if chosen is None:
            chosen = next((item for item in emails if item.verified), None)
        return OAuthProviderProfile(
            subject=str(user.id),
            email=(chosen.email or "").strip().lower() if chosen is not None else None,
            email_verified=bool(chosen.verified) if chosen is not None else False,
            display_name=user.name or user.login,
            avatar_url=user.avatar_url,
        )


def _provider(
    *,
    key: str,
    section_id: str,
    title_key: str,
    label: str,
    authorize_url: str,
    token_url: str,
    userinfo_url: str,
    scope: str,
    userinfo_accept: str | None = None,
    prompt: str | None = None,
    access_type: str | None = None,
) -> OfficialOAuthProviderConnector:
    return OfficialOAuthProviderConnector(
        _OAuthUpstream(
            definition=OAuthProviderDefinition(
                key=key,
                section_id=section_id,
                title_key=title_key,
                label=label,
                icon_key=key,
            ),
            authorize_url=authorize_url,
            token_url=token_url,
            userinfo_url=userinfo_url,
            scope=scope,
            userinfo_accept=userinfo_accept,
            prompt=prompt,
            access_type=access_type,
        )
    )


_PROVIDERS = (
    _provider(
        key="google",
        section_id="oauth_google",
        title_key="settings:SETTINGS_SYSTEM_OAUTH_GOOGLE_TITLE",
        label="Continue with Google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
        scope="openid email profile",
        prompt="select_account",
        access_type="online",
    ),
    _provider(
        key="github",
        section_id="oauth_github",
        title_key="settings:SETTINGS_SYSTEM_OAUTH_GITHUB_TITLE",
        label="Continue with GitHub",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",
        userinfo_url="https://api.github.com/user",
        scope="read:user user:email",
        userinfo_accept="application/vnd.github+json",
    ),
    _provider(
        key="microsoft",
        section_id="oauth_microsoft",
        title_key="settings:SETTINGS_SYSTEM_OAUTH_MICROSOFT_TITLE",
        label="Continue with Microsoft",
        authorize_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",
        userinfo_url="https://graph.microsoft.com/oidc/userinfo",
        scope="openid email profile offline_access User.Read",
        prompt="select_account",
    ),
    _provider(
        key="discord",
        section_id="oauth_discord",
        title_key="settings:SETTINGS_SYSTEM_OAUTH_DISCORD_TITLE",
        label="Continue with Discord",
        authorize_url="https://discord.com/oauth2/authorize",
        token_url="https://discord.com/api/oauth2/token",
        userinfo_url="https://discord.com/api/users/@me",
        scope="identify email",
    ),
)


class OAuthExtension:
    name = _EXTENSION_NAME

    def arclayer_register(self, registry: PluginRegistry) -> None:
        for provider in _PROVIDERS:
            definition = provider.definition
            registry.connectors.register(
                extension=self.name,
                definition=ConnectorDefinition(
                    key=f"oauth.{definition.key}",
                    kind=ConnectorKind.OAUTH,
                    version="1.0.0",
                    trust_level=ConnectorTrustLevel.OFFICIAL,
                    capabilities=("authorization_code", "account_linking", "profile"),
                    config_schema={
                        "enabled": {"type": "boolean"},
                        "clientId": {"type": "string"},
                    },
                    secret_schema={"clientSecret": {"type": "string", "writeOnly": True}},
                    scopes=tuple(provider._upstream.scope.split()),
                    health_contract=("configured", "reachable"),
                    admin=ConnectorAdminMetadata(
                        label_key=definition.title_key,
                        description_key="settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC",
                        settings_section=definition.section_id,
                        icon_key=definition.icon_key,
                    ),
                ),
                factory=lambda provider=provider: provider,
            )
        logger.info("Official OAuth Connectors registered", providers=[item.definition.key for item in _PROVIDERS])


def create_plugin() -> OAuthExtension:
    return OAuthExtension()
