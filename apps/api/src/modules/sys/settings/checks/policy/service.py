from __future__ import annotations

from src.core.i18n import t
from src.modules.sys.settings.schema import SysConfigTestCheck


def _tsys(key: str) -> str:
    return t("sys", key)


class SysConfigChecksPolicyMixin:
    async def _check_oauth_social(self, *, full_value: dict[str, object]) -> list[SysConfigTestCheck]:
        checks: list[SysConfigTestCheck] = []

        def _check_provider(section_id: str, *, code: str) -> SysConfigTestCheck:
            section = full_value.get(section_id)
            if not isinstance(section, dict):
                section = {}
            enabled = section.get("enabled") is True
            if not enabled:
                return SysConfigTestCheck(
                    code=code,
                    ok=True,
                    kind="config",
                    message=_tsys("SYS_CHECK_OAUTH_DISABLED"),
                )

            client_id = section.get("client_id")
            client_secret_raw = section.get("client_secret")
            if not isinstance(client_id, str) or not client_id.strip():
                return SysConfigTestCheck(
                    code=code,
                    ok=False,
                    kind="config",
                    message=_tsys("SYS_CHECK_OAUTH_CLIENT_ID_REQUIRED"),
                )
            if not isinstance(client_secret_raw, str) or not client_secret_raw.strip():
                return SysConfigTestCheck(
                    code=code,
                    ok=False,
                    kind="config",
                    message=_tsys("SYS_CHECK_OAUTH_CLIENT_SECRET_REQUIRED"),
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
                    message=_tsys("SYS_CHECK_AUTH_ALLOWLIST_NOT_LIST"),
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
                        message=_tsys("SYS_CHECK_AUTH_ALLOWLIST_NOT_STRING_LIST"),
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
                    message=_tsys("SYS_CHECK_AUTH_ALLOWLIST_DUPLICATES"),
                )
            ]

        return [SysConfigTestCheck(code="core.auth.registration", ok=True, kind="config")]
