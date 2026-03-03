from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import inspect
import secrets
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, cast
from urllib.parse import urlencode
from uuid import UUID

import httpx
from cryptography.exceptions import InvalidTag
from fastapi import Request
from pydantic import ValidationError
from starlette.responses import RedirectResponse
from tortoise.expressions import Q

from apps.api.src.common.services.base import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Forbidden
from apps.api.src.core.i18n import t
from apps.api.src.infra.cache.valkey import ValkeyClientLike
from apps.api.src.modules.auth.oauth_social.repository import OAuthSocialRepository
from apps.api.src.modules.auth.oauth_social.schema import (
    GitHubEmailItem,
    GitHubUser,
    GoogleUserInfo,
    OAuthLinkedIdentityListOut,
    OAuthLinkedIdentityOut,
    OAuthStatePayload,
)
from apps.api.src.modules.auth.sso.exchange_store import issue_exchange_code
from apps.api.src.modules.auth.sso.schema import AuthSSOExchangePayload
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.crypto import decrypt_secret, is_encrypted, load_master_key, master_key_exists
from apps.api.src.settings.runtime import get_core_settings_value_cached

_FATAL_OAUTH_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_OAUTH_ERRORS):
        raise exc


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
    """
    Core OAuth social login (Google/GitHub).

    Notes:
    - Configuration is managed by sys config namespaces: oauth/auth (stored in core settings record).
    - OAuth callback issues a one-time exchange code, then the frontend exchanges it for a token pair.
    """

    def __init__(self, settings: Settings, *, valkey: ValkeyClientLike) -> None:
        super().__init__(settings)
        self.valkey = valkey
        self.repo = OAuthSocialRepository()

        # Local import to avoid auth module cycles at import time.
        from apps.api.src.modules.auth.service import AuthService

        self.auth_service = AuthService(settings, valkey=valkey)

    async def start(
        self,
        request: Request,
        *,
        provider: str,
        redirect: str | None,
        link_state: str | None,
    ) -> RedirectResponse:
        provider_key = (provider or "").strip().lower()
        safe_redirect = redirect if _is_safe_redirect(redirect) else None

        if provider_key not in {"google", "github"}:
            raise BadRequest(
                message=t("auth", "SSO_PROVIDER_INVALID", default="登录方式不支持"),
                error="SSO_PROVIDER_INVALID",
            )

        config = await self._load_core_oauth_config()

        link_user_id: str | None = None
        raw_link_state = (link_state or "").strip()
        if raw_link_state:
            try:
                linked = await _valkey_getdel_best_effort(self.valkey, f"auth:sso:link_state:{raw_link_state}")
            except BaseException as exc:
                _raise_if_fatal(exc)
                linked = None
            link_user_id = (linked or "").strip() or None
            if not link_user_id:
                frontend_base = await self._resolve_frontend_base_url()
                return self._redirect_to_frontend_link_error(
                    frontend_base,
                    error="link_state_expired",
                    redirect=safe_redirect,
                )

        state = secrets.token_urlsafe(32)
        code_verifier = secrets.token_urlsafe(64)
        code_challenge = _pkce_challenge(code_verifier)

        payload = OAuthStatePayload(
            provider=provider_key,
            redirect=safe_redirect,
            code_verifier=code_verifier,
            link_user_id=link_user_id,
        )
        await self.valkey.set(f"oauth:social:state:{state}", payload.model_dump_json(), ex=600)

        if provider_key == "google":
            section = config.get("oauth_google") if isinstance(config, dict) else None
            if not isinstance(section, dict) or not bool(section.get("enabled")):
                raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")
            client_id = (section.get("client_id") or "").strip() if isinstance(section.get("client_id"), str) else ""
            if not client_id:
                raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")

            callback_url = str(request.url_for("auth_sso_oauth_callback", provider="google"))
            auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
            params = {
                "client_id": client_id,
                "redirect_uri": callback_url,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                "access_type": "online",
                "prompt": "select_account",
            }
            return RedirectResponse(url=f"{auth_url}?{urlencode(params)}", status_code=302)

        section = config.get("oauth_github") if isinstance(config, dict) else None
        if not isinstance(section, dict) or not bool(section.get("enabled")):
            raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")
        client_id = (section.get("client_id") or "").strip() if isinstance(section.get("client_id"), str) else ""
        if not client_id:
            raise Forbidden(message=t("auth", "SSO_UNAVAILABLE", default="SSO 不可用"), error="SSO_UNAVAILABLE")

        callback_url = str(request.url_for("auth_sso_oauth_callback", provider="github"))
        auth_url = "https://github.com/login/oauth/authorize"
        params = {
            "client_id": client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": "read:user user:email",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return RedirectResponse(url=f"{auth_url}?{urlencode(params)}", status_code=302)

    async def callback(
        self,
        request: Request,
        *,
        provider: str,
        code: str | None,
        state: str | None,
    ) -> RedirectResponse:
        provider_key = (provider or "").strip().lower()
        raw_code = (code or "").strip()
        raw_state = (state or "").strip()

        frontend_base = await self._resolve_frontend_base_url()

        if provider_key not in {"google", "github"}:
            return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)
        if not raw_code or not raw_state:
            return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

        try:
            payload_raw = await _valkey_getdel_best_effort(self.valkey, f"oauth:social:state:{raw_state}")
        except BaseException as exc:
            _raise_if_fatal(exc)
            payload_raw = None
        if not payload_raw:
            return self._redirect_to_login_error(frontend_base, error="state_expired", redirect=None)

        try:
            payload = OAuthStatePayload.model_validate_json(payload_raw)
        except ValidationError:
            return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

        if payload.provider != provider_key:
            return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

        redirect = payload.redirect if _is_safe_redirect(payload.redirect) else None
        link_user_id = (payload.link_user_id or "").strip() or None

        config = await self._load_core_oauth_config()

        subject: str = ""
        email: str | None = None
        email_verified: bool = False
        display_name: str | None = None
        avatar_url: str | None = None

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                if provider_key == "google":
                    section = config.get("oauth_google") if isinstance(config, dict) else None
                    client_id = section.get("client_id") if isinstance(section, dict) else None
                    client_secret_raw = section.get("client_secret") if isinstance(section, dict) else None
                    if not isinstance(client_id, str) or not client_id.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)
                    if not isinstance(client_secret_raw, str) or not client_secret_raw.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    client_secret = self._decrypt_core_secret_best_effort(
                        secret_path="oauth_google.client_secret",
                        raw=client_secret_raw,
                    )
                    if client_secret is None:
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    callback_url = str(request.url_for("auth_sso_oauth_callback", provider="google"))
                    token_res = await client.post(
                        "https://oauth2.googleapis.com/token",
                        data={
                            "client_id": client_id.strip(),
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

                elif provider_key == "github":
                    section = config.get("oauth_github") if isinstance(config, dict) else None
                    client_id = section.get("client_id") if isinstance(section, dict) else None
                    client_secret_raw = section.get("client_secret") if isinstance(section, dict) else None
                    if not isinstance(client_id, str) or not client_id.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)
                    if not isinstance(client_secret_raw, str) or not client_secret_raw.strip():
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    client_secret = self._decrypt_core_secret_best_effort(
                        secret_path="oauth_github.client_secret",
                        raw=client_secret_raw,
                    )
                    if client_secret is None:
                        return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                    callback_url = str(request.url_for("auth_sso_oauth_callback", provider="github"))
                    token_res = await client.post(
                        "https://github.com/login/oauth/access_token",
                        data={
                            "client_id": client_id.strip(),
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
                            except ValidationError:
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

            if link_user_id:
                return await self._handle_account_linking(
                    frontend_base=frontend_base,
                    provider=provider_key,
                    subject=subject,
                    email=email,
                    link_user_id=link_user_id,
                    redirect=redirect,
                )

            user_id: UUID | None = None
            identity = await self.repo.get_identity(provider=provider_key, subject=subject)
            if identity is not None:
                user_id = UUID(str(identity.user_id))

            created_new_user = False
            if user_id is None:
                if not email or not email_verified:
                    return self._redirect_to_login_error(frontend_base, error="email_not_verified", redirect=redirect)

                existing_user = await self.repo.get_user_by_email(email=email)
                if existing_user is not None:
                    user_id = UUID(str(existing_user.id))
                else:
                    if not await self._is_public_register_allowed(email=email):
                        return self._redirect_to_login_error(
                            frontend_base, error="provisioning_disabled", redirect=redirect
                        )

                    provisioning = config.get("oauth_provisioning") if isinstance(config, dict) else None
                    auto_provision = (
                        bool(provisioning.get("auto_provision_enabled")) if isinstance(provisioning, dict) else False
                    )
                    if not auto_provision:
                        return self._redirect_to_login_error(
                            frontend_base, error="provisioning_disabled", redirect=redirect
                        )

                    created = await self.repo.create_user(email=email, display_name=display_name, avatar_url=avatar_url)
                    user_id = UUID(str(created.id))
                    created_new_user = True

                await self.repo.create_identity(provider=provider_key, subject=subject, user_id=user_id, email=email)

            provisioning = config.get("oauth_provisioning") if isinstance(config, dict) else None
            auto_accept_invites = (
                bool(provisioning.get("auto_accept_email_invites")) if isinstance(provisioning, dict) else False
            )
            if auto_accept_invites and email and email_verified:
                await self._auto_accept_email_invites(user_id=user_id, email=email)

            if created_new_user:
                await self._ensure_user_bootstrap_best_effort(user_id=user_id)

            exchange_code = await issue_exchange_code(
                self.valkey,
                payload=AuthSSOExchangePayload(user_id=user_id, redirect=redirect),
            )
            return self._redirect_to_frontend_login(frontend_base, oauth_code=exchange_code, redirect=redirect)
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "OAuth callback flow failed",
                action="oauth_callback",
                provider=provider_key,
                error=str(exc),
            )
            return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)

    async def list_identities_out(self, *, user_id: UUID) -> OAuthLinkedIdentityListOut:
        rows = await self.repo.list_identities_for_user(user_id=user_id)
        identities = [
            OAuthLinkedIdentityOut(
                provider=str(row.provider),
                email=(str(row.email) if row.email is not None else None),
                created_at=row.created_at,
            )
            for row in rows
        ]
        return OAuthLinkedIdentityListOut(identities=identities)

    async def unlink_identity(self, *, user_id: UUID, provider: str) -> int:
        provider_key = (provider or "").strip().lower()
        if not provider_key:
            return 0
        return await self.repo.delete_identity_for_user(user_id=user_id, provider=provider_key)

    async def _handle_account_linking(
        self,
        *,
        frontend_base: str,
        provider: str,
        subject: str,
        email: str | None,
        link_user_id: str,
        redirect: str | None,
    ) -> RedirectResponse:
        try:
            from apps.api.src.modules.organization.models.user import User

            target_user = await User.get_or_none(id=UUID(link_user_id))
            if target_user is None:
                return self._redirect_to_frontend_link_error(frontend_base, error="oauth_failed", redirect=redirect)

            existing = await self.repo.get_identity(provider=provider, subject=subject)
            if existing is not None and str(existing.user_id) != str(target_user.id):
                return self._redirect_to_frontend_link_error(
                    frontend_base, error="oauth_already_linked", redirect=redirect
                )

            if existing is None:
                await self.repo.create_identity(
                    provider=provider,
                    subject=subject,
                    user_id=UUID(str(target_user.id)),
                    email=email,
                )
            return self._redirect_to_frontend_link_result(frontend_base, provider=provider, redirect=redirect)
        except BaseException as exc:
            _raise_if_fatal(exc)
            return self._redirect_to_frontend_link_error(frontend_base, error="oauth_failed", redirect=redirect)

    async def _auto_accept_email_invites(self, *, user_id: UUID, email: str) -> None:
        try:
            from apps.api.src.modules.organization.models.user import User
            from apps.api.src.modules.workspaces.models.workspace_invite import WorkspaceEmailInvite

            user = await User.get_or_none(id=user_id)
            if user is None:
                return

            now = datetime.now(UTC)
            qs = WorkspaceEmailInvite.filter(email=(email or "").strip().lower()).filter(
                accepted_at=None, revoked_at=None
            )
            qs = qs.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            rows = await qs.limit(20).all()
            for inv in rows:
                try:
                    from apps.api.src.modules.auth.schema import AcceptExistingInvitationRequest
                    from apps.api.src.modules.workspaces.invitations.tokens import build_invite_token

                    token = build_invite_token(self.settings, code=str(inv.code))
                    await self.auth_service.accept_existing_invitation(
                        payload=AcceptExistingInvitationRequest(token=token),
                        user=user,
                    )
                except BaseException as exc:
                    _raise_if_fatal(exc)
                    self.logger.warning(
                        "OAuth auto-accept invite failed",
                        action="auto_accept_single_invite",
                        user_id=str(user_id),
                        email=email,
                        invite_code=str(inv.code),
                        error=str(exc),
                    )
                    continue
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "OAuth auto-accept invite flow failed",
                action="auto_accept_invites",
                user_id=str(user_id),
                email=email,
                error=str(exc),
            )
            return

    async def _resolve_frontend_base_url(self) -> str:
        """
        Resolve frontend base URL for redirects.

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
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "OAuth frontend base resolve failed",
                action="resolve_frontend_base_url",
                error=str(exc),
            )
        return ""

    async def _load_core_oauth_config(self) -> dict[str, Any]:
        core = await get_core_settings_value_cached(self.settings, ttl_seconds=2.0)
        if not isinstance(core, dict):
            return {}
        # Keep only the sections owned by sys oauth namespace.
        out: dict[str, Any] = {}
        for key in ["oauth_google", "oauth_github", "oauth_provisioning", "auth"]:
            val = core.get(key)
            if isinstance(val, dict):
                out[key] = val
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
        except (binascii.Error, OSError, RuntimeError, TypeError, ValueError, UnicodeError, InvalidTag):
            return None

    async def _is_public_register_allowed(self, *, email: str | None) -> bool:
        from apps.api.src.modules.auth.registration.service import get_public_register_policy

        policy = await get_public_register_policy(self.settings)
        if not policy.enabled:
            return False
        if policy.require_email and not (email or "").strip():
            return False
        if not policy.is_email_allowed(email):
            return False
        return True

    async def _ensure_user_bootstrap_best_effort(self, *, user_id: UUID) -> None:
        try:
            from apps.api.src.modules.provision.service import TenantProvisioningService

            provisioning = TenantProvisioningService(self.settings)
            await provisioning.ensure_user_bootstrap(user_id=user_id, source="register")
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "OAuth user bootstrap failed (best-effort)",
                action="oauth_user_bootstrap",
                user_id=str(user_id),
                error=str(exc),
            )

    def _redirect_to_frontend_login(self, base: str, *, oauth_code: str, redirect: str | None) -> RedirectResponse:
        base = (base or "").strip().rstrip("/")
        path = "/login"
        params: dict[str, str] = {"oauth_code": oauth_code}
        if redirect is not None and _is_safe_redirect(redirect):
            params["redirect"] = redirect
        url = f"{base}{path}" if base else path
        url = f"{url}?{urlencode(params)}"
        return RedirectResponse(url=url, status_code=302)

    def _redirect_to_login_error(self, base: str, *, error: str, redirect: str | None) -> RedirectResponse:
        base = (base or "").strip().rstrip("/")
        path = "/login"
        params: dict[str, str] = {"oauth_error": (error or "oauth_failed")}
        if redirect is not None and _is_safe_redirect(redirect):
            params["redirect"] = redirect
        url = f"{base}{path}" if base else path
        url = f"{url}?{urlencode(params)}"
        return RedirectResponse(url=url, status_code=302)

    def _redirect_to_frontend_link_result(
        self, frontend_base: str, *, provider: str, redirect: str | None
    ) -> RedirectResponse:
        safe_redirect = redirect if (redirect is not None and _is_safe_redirect(redirect)) else "/"
        sep = "&" if "?" in safe_redirect else "?"
        url = f"{frontend_base}{safe_redirect}{sep}linked_provider={provider}"
        return RedirectResponse(url=url, status_code=302)

    def _redirect_to_frontend_link_error(
        self, frontend_base: str, *, error: str, redirect: str | None
    ) -> RedirectResponse:
        safe_redirect = redirect if (redirect is not None and _is_safe_redirect(redirect)) else "/"
        sep = "&" if "?" in safe_redirect else "?"
        url = f"{frontend_base}{safe_redirect}{sep}link_error={error}"
        return RedirectResponse(url=url, status_code=302)
