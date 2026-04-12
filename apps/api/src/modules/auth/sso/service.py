from __future__ import annotations

import asyncio
import binascii
from typing import Any, Protocol
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Request

from src.common.services.base import BaseService
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.infra.cache.valkey import ValkeyClientLike
from src.modules.auth.schema import TokenPair
from src.modules.auth.sessions.request_context import AuthRequestContext
from src.modules.auth.sso.repository import consume_exchange_payload
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.crypto import decrypt_secret, is_encrypted, load_master_key, master_key_exists
from src.settings.runtime import get_core_settings_value_cached

_FATAL_SSO_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_SSO_ERRORS):
        raise exc


def _ta(key: str, default: str) -> str:
    return t("auth", key, default=default)


def _is_safe_redirect(value: str | None) -> bool:
    raw = (value or "").strip()
    if not raw:
        return False
    if not raw.startswith("/"):
        return False
    if raw.startswith("//"):
        return False
    # Avoid recursive auth redirects.
    pathname = raw.split("?", 1)[0] or ""
    if pathname in {"/login", "/reset-password"}:
        return False
    return True


class LoginIssuerLike(Protocol):
    async def issue_after_upstream_auth(
        self,
        *,
        user_id: UUID,
        request_context: AuthRequestContext | None = None,
        auth_method: str = "sso",
    ) -> TokenPair: ...


class AuthSSOService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClientLike | None,
        login_service: LoginIssuerLike,
    ) -> None:
        super().__init__(settings)
        self.valkey = valkey
        self.login_service = login_service

    async def list_providers(self, request: Request, *, redirect: str | None = None) -> list[dict[str, Any]]:
        # Derive API prefix from the current request path. Example:
        # - /api/v1/auth/sso/providers -> /api/v1
        path = request.url.path
        prefix = path.rsplit("/auth/sso/providers", 1)[0] if "/auth/sso/providers" in path else ""
        base = str(request.base_url).rstrip("/")

        safe_redirect = redirect if _is_safe_redirect(redirect) else None

        out: list[dict[str, Any]] = []
        seen: set[str] = set()

        core_providers = await self._list_core_oauth_providers()
        for item in core_providers:
            provider_key = str(item.get("provider", "") or "").strip().lower()
            if not provider_key or provider_key in seen:
                continue
            start_path = str(item.get("start_path", "") or "").strip()
            if not start_path.startswith("/"):
                continue

            start_url = f"{base}{prefix}{start_path}"
            if safe_redirect:
                start_url = f"{start_url}?{urlencode({'redirect': safe_redirect})}"

            out.append({
                "provider": provider_key,
                "label": str(item.get("label", "") or provider_key),
                "icon_key": item.get("icon_key", None),
                "start_url": start_url,
            })
            seen.add(provider_key)

        return out

    def _decrypt_core_secret_best_effort(self, *, secret_path: str, raw: str) -> str | None:
        if not isinstance(raw, str) or not raw.strip():
            return None
        if not is_encrypted(raw):
            return raw

        key_path = self.settings.security.master_key_path
        if not master_key_exists(key_path):
            return None
        try:
            key = load_master_key(key_path)
            aad = f"{CORE_SETTINGS_NAMESPACE}:{secret_path}"
            return decrypt_secret(raw, key=key, aad=aad)
        except (binascii.Error, OSError, RuntimeError, TypeError, ValueError, UnicodeError):
            return None

    async def _list_core_oauth_providers(self) -> list[dict[str, Any]]:
        """
        List built-in OAuth providers controlled by sys config (non-plugin).
        """

        core = await get_core_settings_value_cached(self.settings, ttl_seconds=2.0)
        if not isinstance(core, dict):
            return []

        def _enabled(section_id: str) -> bool:
            section = core.get(section_id)
            if not isinstance(section, dict) or section.get("enabled") is not True:
                return False
            client_id = section.get("client_id")
            client_secret_raw = section.get("client_secret")
            if not isinstance(client_id, str) or not client_id.strip():
                return False
            if not isinstance(client_secret_raw, str) or not client_secret_raw.strip():
                return False
            if is_encrypted(client_secret_raw):
                secret = self._decrypt_core_secret_best_effort(
                    secret_path=f"{section_id}.client_secret",
                    raw=client_secret_raw,
                )
                if secret is None:
                    return False
            return True

        out: list[dict[str, Any]] = []
        if _enabled("oauth_google"):
            out.append({
                "provider": "google",
                "label": "Continue with Google",
                "icon_key": "google",
                "start_path": "/auth/sso/start/google",
            })
        if _enabled("oauth_github"):
            out.append({
                "provider": "github",
                "label": "Continue with GitHub",
                "icon_key": "github",
                "start_path": "/auth/sso/start/github",
            })
        return out

    async def exchange(self, *, code: str, request_context: AuthRequestContext | None = None):
        if self.valkey is None:
            raise ServiceUnavailable(message=_ta("SSO_UNAVAILABLE", "SSO 服务不可用"), error="SSO_UNAVAILABLE")

        raw_code = (code or "").strip()
        if not raw_code:
            raise BadRequest(message=_ta("SSO_CODE_INVALID", "登录码无效"), error="SSO_CODE_INVALID")

        payload = await consume_exchange_payload(self.valkey, code=raw_code)
        if payload is None:
            raise BadRequest(message=_ta("SSO_CODE_INVALID", "登录码无效"), error="SSO_CODE_INVALID")

        # Keep defensive parsing: plugin implementations may still pass string IDs.
        try:
            user_uuid = UUID(str(payload.user_id))
        except (TypeError, ValueError):
            raise BadRequest(message=_ta("SSO_CODE_INVALID", "登录码无效"), error="SSO_CODE_INVALID")

        return await self.login_service.issue_after_upstream_auth(
            user_id=user_uuid,
            request_context=request_context,
            auth_method="sso",
        )
