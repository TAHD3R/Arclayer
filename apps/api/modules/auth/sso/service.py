from __future__ import annotations

from typing import Any, cast
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Request

from apps.api.common.protocols.auth_sso import AuthSSOProviderDecl
from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.modules.auth.service import AuthService
from apps.api.modules.auth.sso.exchange_store import consume_exchange_payload
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.manifest import build_default_config
from apps.api.plugin.types import PluginStatus
from apps.api.settings.runtime_plugins import get_system_plugin_settings_decrypted


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

        raw = self.manager.host.hook.auth_sso_providers()
        decls = _flatten_hook_results(raw)

        # Derive API prefix from the current request path. Example:
        # - /api/v1/auth/sso/providers -> /api/v1
        path = request.url.path
        prefix = path.rsplit("/auth/sso/providers", 1)[0] if "/auth/sso/providers" in path else ""
        base = str(request.base_url).rstrip("/")

        safe_redirect = redirect if _is_safe_redirect(redirect) else None

        out: list[dict[str, Any]] = []
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
            schema = desc.manifest.config_schema
            defaults = build_default_config(desc.manifest)
            config = (
                await get_system_plugin_settings_decrypted(
                    self.settings,
                    plugin_id=plugin_id,
                    schema=schema,
                    defaults=defaults,
                )
                if schema is not None
                else defaults
            )

            try:
                enabled = bool(decl.is_enabled(plugin_config=config))
            except Exception:
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
        except Exception:
            raise BadRequest(message=_ta("SSO_CODE_INVALID", "登录码无效"), error="SSO_CODE_INVALID")

        tokens = await self.auth_service.issue_token_pair_for_user(user_uuid)
        return tokens
