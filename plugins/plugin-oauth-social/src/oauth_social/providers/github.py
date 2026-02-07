from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class GitHubProviderDecl:
    plugin_id: str
    provider: str = "github"
    label: str = "Continue with GitHub"
    icon_key: str | None = "github"
    start_path: str = "/plugins/oauth/start/github"

    def is_enabled(self, *, plugin_config: dict[str, Any]) -> bool:
        section = plugin_config.get("github")
        if not isinstance(section, dict):
            return False
        if not bool(section.get("enabled")):
            return False
        client_id = (section.get("client_id") or "").strip() if isinstance(section.get("client_id"), str) else ""
        client_secret = (
            (section.get("client_secret") or "").strip()
            if isinstance(section.get("client_secret"), str)
            else ""
        )
        return bool(client_id and client_secret)

