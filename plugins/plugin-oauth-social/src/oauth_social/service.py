from __future__ import annotations

import base64
import hashlib
import inspect
import secrets
from datetime import UTC, datetime
from collections.abc import Awaitable, Callable
from typing import Any, cast
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import Request
from starlette.responses import RedirectResponse
from tortoise.expressions import Q

from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Forbidden, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.infra.cache.valkey import ValkeyClientLike
from apps.api.modules.auth.service import AuthService
from apps.api.modules.auth.sso.exchange_store import issue_exchange_code
from apps.api.modules.auth.sso.schema import AuthSSOExchangePayload
from apps.api.modules.workspaces.invitations.tokens import build_invite_token
from apps.api.plugin.manifest import PluginManifest, build_default_config
from apps.api.settings.runtime import get_core_settings_value_cached
from apps.api.settings.runtime_plugins import get_system_plugin_settings_decrypted

from oauth_social.repository import OAuthSocialRepository
from oauth_social.schema import (
    GitHubEmailItem,
    GitHubUser,
    GoogleUserInfo,
    OAuthStatePayload,
)


def _to_b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return _to_b64url(digest)


def _is_safe_redirect(value: str | None) -> bool:
    raw = (value or "").strip()
    if not raw:
        return False
    if not raw.startswith("/"):
        return False
    if raw.startswith("//"):
        return False
    pathname = raw.split("?", 1)[0] or ""
    if pathname in {"/login", "/reset-password"}:
        return False
    return True


async def _valkey_getdel_best_effort(client: ValkeyClientLike, key: str) -> str | None:
    getdel = getattr(client, "getdel", None)
    if callable(getdel):
        fn = cast(Callable[[str], Any], getdel)
        result = fn(key)
        if inspect.isawaitable(result):
            return await cast(Awaitable[str | None], result)
        if result is None or isinstance(result, str):
            await client.delete(key)
            return result
    value = await client.get(key)
    if value is None:
        return None
    await client.delete(key)
    return value


class OAuthSocialService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        manifest: PluginManifest,
        valkey: ValkeyClientLike,
    ) -> None:
        super().__init__(settings)
        self.manifest = manifest
        self.valkey = valkey
        self.repo = OAuthSocialRepository()
        self.auth_service = AuthService(settings, valkey=valkey)

    async def start(self, request: Request, *, provider: str, redirect: str | None) -> RedirectResponse:
        provider = (provider or "").strip().lower()
        safe_redirect = redirect if _is_safe_redirect(redirect) else None

        if provider not in {"google", "github"}:
            raise BadRequest(
                message=t("auth", "SSO_PROVIDER_INVALID", default="登录方式不支持"),
                error="SSO_PROVIDER_INVALID",
            )

        schema = self.manifest.config_schema
        if schema is None:
            raise ServiceUnavailable(message=t("plugin", "PLUGIN_CONFIG_NOT_SUPPORTED", default="插件不支持配置"))
        defaults = build_default_config(self.manifest)
        config = await get_system_plugin_settings_decrypted(
            self.settings,
            plugin_id=self.manifest.plugin.id,
            schema=schema,
            defaults=defaults,
        )

        state = secrets.token_urlsafe(32)
        code_verifier = secrets.token_urlsafe(64)
        code_challenge = _pkce_challenge(code_verifier)

        payload = OAuthStatePayload(provider=provider, redirect=safe_redirect, code_verifier=code_verifier)
        await self.valkey.set(
            f"oauth:social:state:{state}",
            payload.model_dump_json(),
            ex=600,
        )

        if provider == "google":
            section = config.get("google") if isinstance(config, dict) else None
            if not isinstance(section, dict) or not bool(section.get("enabled")):
                raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")
            client_id = (section.get("client_id") or "").strip() if isinstance(section.get("client_id"), str) else ""
            if not client_id:
                raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")

            callback_url = str(request.url_for("oauth_social_callback", provider="google"))
            params = {
                "client_id": client_id,
                "redirect_uri": callback_url,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                "access_type": "online",
                "prompt": "consent",
            }
            url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
            return RedirectResponse(url=url, status_code=302)

        if provider == "github":
            section = config.get("github") if isinstance(config, dict) else None
            if not isinstance(section, dict) or not bool(section.get("enabled")):
                raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")
            client_id = (section.get("client_id") or "").strip() if isinstance(section.get("client_id"), str) else ""
            if not client_id:
                raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")

            callback_url = str(request.url_for("oauth_social_callback", provider="github"))
            params = {
                "client_id": client_id,
                "redirect_uri": callback_url,
                "response_type": "code",
                "scope": "read:user user:email",
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
            }
            url = "https://github.com/login/oauth/authorize?" + urlencode(params)
            return RedirectResponse(url=url, status_code=302)
        raise BadRequest(message=t("auth", "SSO_PROVIDER_INVALID", default="登录方式不支持"), error="SSO_PROVIDER_INVALID")

    async def callback(
        self,
        request: Request,
        *,
        provider: str,
        code: str | None,
        state: str | None,
    ) -> RedirectResponse:
        frontend_base = await self._resolve_frontend_base_url()
        try:
            provider = (provider or "").strip().lower()
            if provider not in {"google", "github"}:
                return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

            raw_code = (code or "").strip()
            raw_state = (state or "").strip()
            if not raw_code or not raw_state:
                return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

            state_key = f"oauth:social:state:{raw_state}"
            payload_raw = await _valkey_getdel_best_effort(self.valkey, state_key)
            if not payload_raw:
                return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

            payload = OAuthStatePayload.model_validate_json(payload_raw)
            redirect = payload.redirect if _is_safe_redirect(payload.redirect) else None

            schema = self.manifest.config_schema
            if schema is None:
                return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)
            defaults = build_default_config(self.manifest)
            config = await get_system_plugin_settings_decrypted(
                self.settings,
                plugin_id=self.manifest.plugin.id,
                schema=schema,
                defaults=defaults,
            )

            subject: str | None = None
            email: str | None = None
            email_verified: bool = False
            display_name: str | None = None
            avatar_url: str | None = None

            async with httpx.AsyncClient(timeout=15.0) as client:
                if provider == "google":
                    section = config.get("google") if isinstance(config, dict) else None
                    client_id = section.get("client_id") if isinstance(section, dict) else None
                    client_secret = section.get("client_secret") if isinstance(section, dict) else None
                    if not isinstance(client_id, str) or not client_id.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)
                    if not isinstance(client_secret, str) or not client_secret.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    callback_url = str(request.url_for("oauth_social_callback", provider="google"))
                    token_res = await client.post(
                        "https://oauth2.googleapis.com/token",
                        data={
                            "client_id": client_id,
                            "client_secret": client_secret,
                            "code": raw_code,
                            "code_verifier": payload.code_verifier,
                            "grant_type": "authorization_code",
                            "redirect_uri": callback_url,
                        },
                        headers={"accept": "application/json"},
                    )
                    token_res.raise_for_status()
                    token = token_res.json()
                    access_token = token.get("access_token")
                    if not isinstance(access_token, str) or not access_token:
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    userinfo_res = await client.get(
                        "https://openidconnect.googleapis.com/v1/userinfo",
                        headers={"authorization": f"Bearer {access_token}"},
                    )
                    userinfo_res.raise_for_status()
                    info = GoogleUserInfo.model_validate(userinfo_res.json())
                    subject = info.sub
                    email = (info.email or "").strip().lower() or None
                    email_verified = bool(info.email_verified)
                    display_name = info.name
                    avatar_url = info.picture

                elif provider == "github":
                    section = config.get("github") if isinstance(config, dict) else None
                    client_id = section.get("client_id") if isinstance(section, dict) else None
                    client_secret = section.get("client_secret") if isinstance(section, dict) else None
                    if not isinstance(client_id, str) or not client_id.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)
                    if not isinstance(client_secret, str) or not client_secret.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    callback_url = str(request.url_for("oauth_social_callback", provider="github"))
                    token_res = await client.post(
                        "https://github.com/login/oauth/access_token",
                        data={
                            "client_id": client_id,
                            "client_secret": client_secret,
                            "code": raw_code,
                            "redirect_uri": callback_url,
                            "code_verifier": payload.code_verifier,
                        },
                        headers={"accept": "application/json"},
                    )
                    token_res.raise_for_status()
                    token = token_res.json()
                    access_token = token.get("access_token")
                    if not isinstance(access_token, str) or not access_token:
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    user_res = await client.get(
                        "https://api.github.com/user",
                        headers={
                            "authorization": f"Bearer {access_token}",
                            "accept": "application/vnd.github+json",
                        },
                    )
                    user_res.raise_for_status()
                    user = GitHubUser.model_validate(user_res.json())
                    subject = str(user.id)
                    display_name = user.name or user.login
                    avatar_url = user.avatar_url

                    emails_res = await client.get(
                        "https://api.github.com/user/emails",
                        headers={
                            "authorization": f"Bearer {access_token}",
                            "accept": "application/vnd.github+json",
                        },
                    )
                    emails_res.raise_for_status()
                    emails_payload = emails_res.json()
                    emails: list[GitHubEmailItem] = []
                    if isinstance(emails_payload, list):
                        for row in emails_payload:
                            try:
                                emails.append(GitHubEmailItem.model_validate(row))
                            except Exception:
                                continue
                    chosen = None
                    for item in emails:
                        if bool(item.primary) and bool(item.verified):
                            chosen = item
                            break
                    if chosen is None:
                        for item in emails:
                            if bool(item.verified):
                                chosen = item
                                break
                    if chosen is not None:
                        email = (chosen.email or "").strip().lower() or None
                        email_verified = bool(chosen.verified)

            if not subject:
                return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

            # Resolve local user.
            identity = await self.repo.get_identity(provider=provider, subject=subject)
            user_id: UUID | None = UUID(str(identity.user_id)) if identity is not None else None

            if user_id is None:
                if not email or not email_verified:
                    # Verified email is required for account binding and provisioning.
                    return self._redirect_to_login_error(frontend_base, error="email_not_verified", redirect=redirect)

                existing_user = await self.repo.get_user_by_email(email=email)
                if existing_user is not None:
                    user_id = UUID(str(existing_user.id))
                else:
                    provisioning = config.get("provisioning") if isinstance(config, dict) else None
                    auto_provision = (
                        bool(provisioning.get("auto_provision_enabled")) if isinstance(provisioning, dict) else False
                    )
                    if not auto_provision:
                        return self._redirect_to_login_error(
                            frontend_base, error="provisioning_disabled", redirect=redirect
                        )
                    created = await self.repo.create_user(email=email, display_name=display_name, avatar_url=avatar_url)
                    user_id = UUID(str(created.id))

                # Create identity mapping.
                await self.repo.create_identity(provider=provider, subject=subject, user_id=user_id, email=email)

            # Optional: auto accept email invites.
            provisioning = config.get("provisioning") if isinstance(config, dict) else None
            auto_accept_invites = (
                bool(provisioning.get("auto_accept_email_invites")) if isinstance(provisioning, dict) else False
            )
            if auto_accept_invites and email and email_verified:
                await self._auto_accept_email_invites(user_id=user_id, email=email)

            # Issue exchange code (one-time).
            exchange_code = await issue_exchange_code(
                self.valkey,
                payload=AuthSSOExchangePayload(user_id=user_id, redirect=redirect),
            )

            return self._redirect_to_frontend_login(frontend_base, oauth_code=exchange_code, redirect=redirect)
        except Exception:
            return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

    async def _auto_accept_email_invites(self, *, user_id: UUID, email: str) -> None:
        try:
            from apps.api.modules.workspaces.models.workspace_invite import WorkspaceEmailInvite
            from apps.api.modules.organization.models.user import User

            user = await User.get_or_none(id=user_id)
            if user is None:
                return

            now = datetime.now(UTC)
            qs = WorkspaceEmailInvite.filter(email=(email or "").strip().lower()).filter(accepted_at=None, revoked_at=None)
            qs = qs.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            rows = await qs.limit(20).all()
            for inv in rows:
                try:
                    token = build_invite_token(self.settings, code=str(inv.code))
                    from apps.api.modules.auth.schema import AcceptExistingInvitationRequest

                    await self.auth_service.accept_existing_invitation(
                        payload=AcceptExistingInvitationRequest(token=token),
                        user=user,
                    )
                except Exception:
                    continue
        except Exception:
            return

    async def _resolve_frontend_base_url(self) -> str:
        """
        Resolve the frontend base url for redirects.

        Priority:
        1) APPLICATION__FRONTEND_BASE_URL (env)
        2) core settings `site.url` (DB)
        3) empty (relative redirect)
        """

        explicit = (self.settings.application.frontend_base_url or "").strip().rstrip("/")
        if explicit:
            return explicit

        try:
            core = await get_core_settings_value_cached(self.settings, ttl_seconds=2.0)
            site = core.get("site") if isinstance(core, dict) else None
            url = site.get("url") if isinstance(site, dict) else None
            if isinstance(url, str) and url.strip():
                return url.strip().rstrip("/")
        except Exception:
            pass
        return ""

    def _redirect_to_frontend_login(self, base: str, *, oauth_code: str, redirect: str | None) -> RedirectResponse:
        base = (base or "").strip().rstrip("/")
        path = "/login"
        params: dict[str, str] = {"oauth_code": oauth_code}
        if _is_safe_redirect(redirect):
            params["redirect"] = redirect  # redirect is a path, not a full URL
        url = f"{base}{path}" if base else path
        url = f"{url}?{urlencode(params)}"
        return RedirectResponse(url=url, status_code=302)

    def _redirect_to_login_error(self, base: str, *, error: str, redirect: str | None) -> RedirectResponse:
        base = (base or "").strip().rstrip("/")
        path = "/login"
        params: dict[str, str] = {"oauth_error": (error or "oauth_failed")}
        if _is_safe_redirect(redirect):
            params["redirect"] = redirect
        url = f"{base}{path}" if base else path
        url = f"{url}?{urlencode(params)}"
        return RedirectResponse(url=url, status_code=302)
