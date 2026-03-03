from __future__ import annotations

import asyncio
import binascii
from typing import Any, cast
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Request
from tortoise.exceptions import OperationalError

from apps.api.src.common.protocols.auth_sso import AuthSSOProviderDecl
from apps.api.src.common.services.base import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, ServiceUnavailable
from apps.api.src.core.i18n import t
from apps.api.src.core.logging import get_logger
from apps.api.src.infra.cache.valkey import ValkeyClientLike
from apps.api.src.modules.auth.service import AuthService
from apps.api.src.modules.auth.sso.exchange_store import consume_exchange_payload
from apps.api.src.modules.organization.models.org_plugin_state import OrganizationPluginState
from apps.api.src.modules.organization.runtime import get_single_organization_id
from apps.api.src.modules.system.models.plugin import PluginRecord
from apps.api.src.plugin.manager import PluginManager
from apps.api.src.plugin.manifest import build_default_config
from apps.api.src.plugin.types import PluginStatus
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.crypto import decrypt_secret, is_encrypted, load_master_key, master_key_exists
from apps.api.src.settings.runtime import get_core_settings_value_cached
from apps.api.src.settings.runtime_plugins import get_org_plugin_settings_decrypted

logger = get_logger(__name__)
_FATAL_SSO_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)
_SSO_STATE_LOOKUP_ERRORS = (OperationalError, RuntimeError, TypeError, ValueError)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_SSO_ERRORS):
        raise exc


def _ta(key: str, default: str) -> str:
    return t("auth", key, default=default)


def _flatten_hook_results(raw: list[Any] | None) -> list[Any]:
    out: list[Any] = []
    for part in raw or []:
        if part is None:
            continue
        if isinstance(part, list):
            out.extend(part)
            continue
        out.append(part)
    return out


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


class AuthSSOService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        manager: PluginManager,
        valkey: ValkeyClientLike | None,
        auth_service: AuthService,
    ) -> None:
        super().__init__(settings)
        self.manager = manager
        self.valkey = valkey
        self.auth_service = auth_service

    async def list_providers(self, request: Request, *, redirect: str | None = None) -> list[dict[str, Any]]:
        if not self.manager.descriptors:
            self.manager.discover()

        organization_id = await get_single_organization_id()

        raw = self.manager.host.hook.auth_sso_providers()
        decls = _flatten_hook_results(raw)

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

        # Plugin providers are organization-scoped. If we cannot resolve a stable org id,
        # keep only the core providers (best-effort, avoids cross-tenant leakage).
        if organization_id is None:
            return out
        for obj in decls:
            decl = cast(AuthSSOProviderDecl, obj)
            plugin_id = (getattr(decl, "plugin_id", None) or "").strip()
            if not plugin_id:
                continue

            record = await PluginRecord.get_or_none(plugin_id=plugin_id)
            if record is None or record.status != PluginStatus.STARTED:
                continue

            desc = self.manager.descriptors.get(plugin_id)
            if desc is None:
                continue
            if (desc.manifest.plugin.management_scope or "workspace").strip().lower() != "organization":
                continue

            try:
                state = await OrganizationPluginState.get_or_none(organization_id=organization_id, plugin_id=plugin_id)
            except _SSO_STATE_LOOKUP_ERRORS as exc:
                # Rollout compatibility: treat missing org plugin state storage as disabled.
                logger.warning(
                    "SSO provider org plugin state lookup failed",
                    plugin_id=plugin_id,
                    organization_id=str(organization_id),
                    action="sso_provider_state_lookup",
                    error=str(exc),
                )
                continue
            if state is None or not bool(state.enabled):
                continue

            schema = desc.manifest.config_schema
            defaults = build_default_config(desc.manifest)
            config = (
                await get_org_plugin_settings_decrypted(
                    self.settings,
                    organization_id=organization_id,
                    plugin_id=plugin_id,
                    schema=schema,
                    defaults=defaults,
                )
                if schema is not None
                else defaults
            )

            try:
                enabled = bool(decl.is_enabled(plugin_config=config))
            except BaseException as exc:
                _raise_if_fatal(exc)
                logger.warning(
                    "SSO provider availability check failed",
                    plugin_id=plugin_id,
                    action="sso_provider_enabled_check",
                    error=str(exc),
                )
                enabled = False
            if not enabled:
                continue

            start_path = (getattr(decl, "start_path", None) or "").strip()
            if not start_path.startswith("/"):
                continue

            start_url = f"{base}{prefix}{start_path}"
            if safe_redirect:
                start_url = f"{start_url}?{urlencode({'redirect': safe_redirect})}"

            out.append({
                "provider": str(getattr(decl, "provider", "") or ""),
                "label": str(getattr(decl, "label", "") or ""),
                "icon_key": getattr(decl, "icon_key", None),
                "start_url": start_url,
            })
            seen.add(str(getattr(decl, "provider", "") or "").strip().lower())

        return out

    def _decrypt_core_secret_best_effort(self, *, secret_path: str, raw: str) -> str | None:
        if not isinstance(raw, str) or not raw.strip():
            return None
        if not is_encrypted(raw):
            return raw

        key_path = self.settings.setup.master_key_path
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

    async def exchange(self, *, code: str):
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

        tokens = await self.auth_service.issue_token_pair_for_user(user_uuid)
        return tokens
