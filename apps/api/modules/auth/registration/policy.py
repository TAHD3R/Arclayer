from __future__ import annotations

from dataclasses import dataclass

from apps.api.config import Settings
from apps.api.settings.runtime import get_core_settings_value_cached


@dataclass(frozen=True)
class PublicRegisterPolicy:
    enabled: bool
    require_email: bool
    email_domains_allowlist: frozenset[str]

    def is_email_allowed(self, email: str | None) -> bool:
        if not self.email_domains_allowlist:
            return True
        raw = (email or "").strip().lower()
        if not raw or "@" not in raw:
            return False
        _local, domain = raw.rsplit("@", 1)
        domain = domain.strip().lower().lstrip(".")
        return bool(domain and domain in self.email_domains_allowlist)


def _normalize_domain(value: str) -> str | None:
    raw = (value or "").strip().lower().lstrip(".")
    return raw or None


async def get_public_register_policy(settings: Settings) -> PublicRegisterPolicy:
    """
    Resolve public registration policy.

    Priority:
    1) System-scoped core settings (DB) section `auth.*`
    2) Env fallback (AUTH__ALLOW_PUBLIC_REGISTER) for bootstrap/dev compatibility
    """

    core = await get_core_settings_value_cached(settings, ttl_seconds=2.0)
    auth = core.get("auth") if isinstance(core, dict) else None

    enabled = auth.get("public_register_enabled") if isinstance(auth, dict) else None
    enabled_bool = enabled if isinstance(enabled, bool) else bool(settings.auth.allow_public_register)

    require_email = auth.get("public_register_require_email") if isinstance(auth, dict) else None
    require_email_bool = require_email if isinstance(require_email, bool) else False

    allowlist_raw = auth.get("public_register_email_domains_allowlist") if isinstance(auth, dict) else None
    domains: set[str] = set()
    if isinstance(allowlist_raw, list):
        for item in allowlist_raw:
            if not isinstance(item, str):
                continue
            normalized = _normalize_domain(item)
            if normalized:
                domains.add(normalized)

    return PublicRegisterPolicy(
        enabled=enabled_bool,
        require_email=require_email_bool,
        email_domains_allowlist=frozenset(domains),
    )
