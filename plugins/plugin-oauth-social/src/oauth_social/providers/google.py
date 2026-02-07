from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class GoogleProviderDecl:
    plugin_id: str
    provider: str = "google"
    label: str = "Continue with Google"
    icon_key: str | None = "google"
    start_path: str = "/plugins/oauth/start/google"

    def is_enabled(self, *, plugin_config: dict[str, Any]) -> bool:
        section = plugin_config.get("google")
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

