from __future__ import annotations

from typing import Any, Protocol


class AuthSSOProviderDecl(Protocol):
    """
    Structural contract for pluggy-declared SSO providers.

    Notes:
    - Keep it minimal to avoid import cycles (plugins should be able to implement this
      without importing app modules).
    - Hook returns are typed as Any in hookspec; consumers should `cast(...)` to this protocol.
    """

    plugin_id: str
    provider: str
    label: str
    icon_key: str | None
    start_path: str

    def is_enabled(self, *, plugin_config: dict[str, Any]) -> bool: ...
