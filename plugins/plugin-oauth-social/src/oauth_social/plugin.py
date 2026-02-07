from __future__ import annotations

from typing import Any

from apps.api.plugin.hooks import hookimpl
from apps.api.plugin.types import BasePlugin

from oauth_social.providers.github import GitHubProviderDecl
from oauth_social.providers.google import GoogleProviderDecl


class OAuthSocialPlugin(BasePlugin):
    """
    Social OAuth plugin (Google/GitHub).

    Notes:
    - The plugin exposes public routes under `/plugins/oauth/*`.
    - The host aggregates provider declarations via pluggy hook `auth_sso_providers`.
    """

    @hookimpl
    def auth_sso_providers(self) -> list[Any]:  # type: ignore[override]
        return [
            GoogleProviderDecl(plugin_id=self.plugin_id),
            GitHubProviderDecl(plugin_id=self.plugin_id),
        ]

