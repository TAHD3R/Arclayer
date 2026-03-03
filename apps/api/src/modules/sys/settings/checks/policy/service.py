from __future__ import annotations

from apps.api.src.modules.sys.settings.schema import SysConfigTestCheck
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE


class SysConfigChecksPolicyMixin:
    async def _check_oauth_social(self, *, full_value: dict[str, object]) -> list[SysConfigTestCheck]:
        checks: list[SysConfigTestCheck] = []

        def _check_provider(section_id: str, *, code: str) -> SysConfigTestCheck:
            section = full_value.get(section_id)
            if not isinstance(section, dict):
                section = {}
            enabled = section.get("enabled") is True
            if not enabled:
                return SysConfigTestCheck(code=code, ok=True, kind="config", message="OAuth disabled (skipped)")

            client_id = section.get("client_id")
            client_secret_raw = section.get("client_secret")
            if not isinstance(client_id, str) or not client_id.strip():
                return SysConfigTestCheck(code=code, ok=False, kind="config", message="Missing client_id")
            if not isinstance(client_secret_raw, str) or not client_secret_raw.strip():
                return SysConfigTestCheck(code=code, ok=False, kind="config", message="Missing client_secret")

            secret = self._decrypt_secret_str_best_effort(
                namespace=CORE_SETTINGS_NAMESPACE,
                secret_path=f"{section_id}.client_secret",
                raw=client_secret_raw,
            )
            if secret is None:
                return SysConfigTestCheck(
                    code=code,
                    ok=False,
                    kind="config",
                    message="Cannot decrypt client_secret (master key missing or invalid)",
                )
            return SysConfigTestCheck(code=code, ok=True, kind="config")

        checks.append(_check_provider("oauth_google", code="core.oauth.google"))
        checks.append(_check_provider("oauth_github", code="core.oauth.github"))
        return checks

    async def _check_auth_policy(self, *, full_value: dict[str, object]) -> list[SysConfigTestCheck]:
        section = full_value.get("auth")
        if not isinstance(section, dict):
            section = {}

        allowlist = section.get("public_register_email_domains_allowlist")
        if allowlist is None:
            return [SysConfigTestCheck(code="core.auth.registration", ok=True, kind="config")]

        if not isinstance(allowlist, list):
            return [
                SysConfigTestCheck(
                    code="core.auth.registration",
                    ok=False,
                    kind="config",
                    message="public_register_email_domains_allowlist must be a list",
                )
            ]

        normalized: list[str] = []
        for item in allowlist:
            if not isinstance(item, str):
                return [
                    SysConfigTestCheck(
                        code="core.auth.registration",
                        ok=False,
                        kind="config",
                        message="public_register_email_domains_allowlist must only contain strings",
                    )
                ]
            d = item.strip().lower().lstrip(".")
            if not d:
                continue
            normalized.append(d)

        if len(normalized) != len({*normalized}):
            return [
                SysConfigTestCheck(
                    code="core.auth.registration",
                    ok=False,
                    kind="config",
                    message="public_register_email_domains_allowlist contains duplicates",
                )
            ]

        return [SysConfigTestCheck(code="core.auth.registration", ok=True, kind="config")]
