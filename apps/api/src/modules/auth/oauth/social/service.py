from __future__ import annotations

import asyncio
import base64
import hashlib
import inspect
import secrets
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, cast
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import Request
from pydantic import ValidationError
from starlette.responses import RedirectResponse
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, Forbidden
from src.core.i18n import t
from src.core.registries import ConnectorRegistry
from src.core.services import BaseService
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.auth.oauth.social.providers import (
    get_oauth_provider_connector,
)
from src.modules.auth.oauth.social.repository import OAuthSocialRepository
from src.modules.auth.oauth.social.schema import (
    OAuthLinkedIdentityListOut,
    OAuthLinkedIdentityOut,
    OAuthStatePayload,
)
from src.modules.auth.sso.repository import issue_exchange_code
from src.modules.auth.sso.schema import AuthSSOExchangePayload
from src.platform.cache.valkey import ValkeyClientLike
from src.settings.runtime import get_core_settings_value_cached

_FATAL_OAUTH_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_OAUTH_ERRORS):
        raise exc


def _summarize_oauth_exception(exc: BaseException) -> dict[str, object]:
    details: dict[str, object] = {
        "error_type": exc.__class__.__name__,
        "error_repr": repr(exc),
    }

    if isinstance(exc, httpx.HTTPStatusError):
        details["http_status"] = exc.response.status_code
        body = (exc.response.text or "").strip()
        if body:
            details["http_body"] = body[:500]
        return details

    if isinstance(exc, ValidationError):
        details["validation_errors"] = exc.errors()
        return details

    message = str(exc).strip()
    if message:
        details["error"] = message

    return details


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
    Core OAuth social login.

    Notes:
    - Configuration is managed by sys config namespaces: oauth/auth (stored in core settings record).
    - OAuth callback issues a one-time exchange code, then the frontend exchanges it for a token pair.
    """

    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClientLike,
        connector_registry: ConnectorRegistry,
    ) -> None:
        super().__init__(settings)
        self.valkey = valkey
        self.connector_registry = connector_registry
        self.repo = OAuthSocialRepository()

        # Local import to avoid auth module cycles at import time.
        from src.modules.auth.service import AuthService

        self.auth_service = AuthService(
            settings,
            valkey=valkey,
            connector_registry=connector_registry,
        )

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

        provider_connector = get_oauth_provider_connector(self.connector_registry, provider_key)
        if provider_connector is None:
            raise BadRequest(
                message=t("auth", "SSO_PROVIDER_INVALID"),
                error="SSO_PROVIDER_INVALID",
            )
        provider_definition = provider_connector.definition

        config = await self._load_core_oauth_config((provider_definition.section_id,))

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

        section = config.get(provider_definition.section_id) if isinstance(config, dict) else None
        if not isinstance(section, dict) or not bool(section.get("enabled")):
            raise Forbidden(message=t("auth", "SSO_UNAVAILABLE"), error="SSO_UNAVAILABLE")
        client_id = (section.get("client_id") or "").strip() if isinstance(section.get("client_id"), str) else ""
        if not client_id:
            raise Forbidden(message=t("auth", "SSO_UNAVAILABLE"), error="SSO_UNAVAILABLE")
        client_secret = (
            (section.get("client_secret") or "").strip() if isinstance(section.get("client_secret"), str) else ""
        )
        if not client_secret:
            raise Forbidden(message=t("auth", "SSO_UNAVAILABLE"), error="SSO_UNAVAILABLE")

        callback_url = str(request.url_for("auth_sso_oauth_callback", provider=provider_definition.key))
        authorize_url = provider_connector.build_authorize_url(
            client_id=client_id,
            redirect_uri=callback_url,
            state=state,
            code_challenge=code_challenge,
        )
        return RedirectResponse(url=authorize_url, status_code=302)

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

        provider_connector = get_oauth_provider_connector(self.connector_registry, provider_key)
        if provider_connector is None:
            return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=None)
        provider_definition = provider_connector.definition
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

        config = await self._load_core_oauth_config((provider_definition.section_id,))

        subject: str = ""
        email: str | None = None
        email_verified: bool = False
        display_name: str | None = None
        avatar_url: str | None = None
        stage = "load_provider_config"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                stage = f"load_{provider_definition.key}_config"
                section = config.get(provider_definition.section_id) if isinstance(config, dict) else None
                client_id = section.get("client_id") if isinstance(section, dict) else None
                client_secret_raw = section.get("client_secret") if isinstance(section, dict) else None
                if not isinstance(client_id, str) or not client_id.strip():
                    return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)
                if not isinstance(client_secret_raw, str) or not client_secret_raw.strip():
                    return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

                stage = f"exchange_{provider_definition.key}_code"
                callback_url = str(request.url_for("auth_sso_oauth_callback", provider=provider_definition.key))
                access_token = await provider_connector.exchange_access_token(
                    client=client,
                    client_id=client_id.strip(),
                    client_secret=client_secret_raw.strip(),
                    code=raw_code,
                    code_verifier=payload.code_verifier,
                    redirect_uri=callback_url,
                )

                stage = f"fetch_{provider_definition.key}_userinfo"
                profile = await provider_connector.fetch_profile(
                    client=client,
                    access_token=access_token,
                )
                stage = f"parse_{provider_definition.key}_userinfo"
                subject = profile.subject
                email = profile.email
                email_verified = profile.email_verified
                display_name = profile.display_name
                avatar_url = profile.avatar_url

            stage = "validate_subject"
            if not subject:
                return self._redirect_to_login_error(frontend_base, error="oauth_failed", redirect=redirect)

            if link_user_id:
                stage = "link_identity"
                return await self._handle_account_linking(
                    frontend_base=frontend_base,
                    provider=provider_key,
                    subject=subject,
                    email=email,
                    link_user_id=link_user_id,
                    redirect=redirect,
                )

            user_id: UUID | None = None
            stage = "load_identity"
            identity = await self.repo.get_identity(provider=provider_key, subject=subject)
            if identity is not None:
                user_id = UUID(str(identity.user_id))

            if user_id is None:
                stage = "validate_email"
                if not email or not email_verified:
                    return self._redirect_to_login_error(frontend_base, error="email_not_verified", redirect=redirect)

                stage = "load_existing_user"
                existing_user = await self.repo.get_user_by_email(email=email)
                if existing_user is not None:
                    user_id = UUID(str(existing_user.id))
                else:
                    stage = "check_public_register_policy"
                    if not await self._is_public_register_allowed(email=email):
                        return self._redirect_to_login_error(
                            frontend_base, error="provisioning_disabled", redirect=redirect
                        )

                    stage = "check_auto_provision"
                    provisioning = config.get("oauth_provisioning") if isinstance(config, dict) else None
                    auto_provision = (
                        bool(provisioning.get("auto_provision_enabled")) if isinstance(provisioning, dict) else False
                    )
                    if not auto_provision:
                        return self._redirect_to_login_error(
                            frontend_base, error="provisioning_disabled", redirect=redirect
                        )

                    stage = "create_user"
                    created = await self.repo.create_user(email=email, display_name=display_name, avatar_url=avatar_url)
                    user_id = UUID(str(created.id))

                stage = "create_identity"
                await self.repo.create_identity(provider=provider_key, subject=subject, user_id=user_id, email=email)

            stage = "auto_accept_invites"
            provisioning = config.get("oauth_provisioning") if isinstance(config, dict) else None
            auto_accept_invites = (
                bool(provisioning.get("auto_accept_email_invites")) if isinstance(provisioning, dict) else False
            )
            if auto_accept_invites and email and email_verified:
                await self._auto_accept_email_invites(user_id=user_id, email=email)

            stage = "issue_exchange_code"
            exchange_code = await issue_exchange_code(
                self.valkey,
                payload=AuthSSOExchangePayload(user_id=user_id, redirect=redirect),
            )
            stage = "redirect_to_frontend"
            return self._redirect_to_frontend_login(frontend_base, oauth_code=exchange_code, redirect=redirect)
        except BaseException as exc:
            _raise_if_fatal(exc)
            if stage == "link_identity":
                raise
            self.logger.warning(
                "OAuth callback flow failed",
                action="oauth_callback",
                provider=provider_key,
                stage=stage,
                **_summarize_oauth_exception(exc),
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
        async with self.tx() as conn:
            identity = await self.repo.get_identity_for_user(user_id=user_id, provider=provider_key, conn=conn)
            if identity is None:
                return 0
            deleted = await self.repo.delete_identity_for_user(user_id=user_id, provider=provider_key, conn=conn)
            await self._write_sso_activity_event(
                name="auth.sso.unlinked",
                user_id=user_id,
                provider=provider_key,
                subject=str(identity.subject),
                email=str(identity.email) if identity.email is not None else None,
                conn=conn,
            )
            return deleted

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
        target_user = await self.repo.get_user_by_id(user_id=UUID(link_user_id))
        if target_user is None:
            return self._redirect_to_frontend_link_error(frontend_base, error="oauth_failed", redirect=redirect)

        user_id = UUID(str(target_user.id))
        async with self.tx() as conn:
            existing = await self.repo.get_identity(provider=provider, subject=subject, conn=conn)
            if existing is not None and str(existing.user_id) != str(target_user.id):
                return self._redirect_to_frontend_link_error(
                    frontend_base, error="oauth_already_linked", redirect=redirect
                )

            if existing is None:
                await self.repo.create_identity(
                    provider=provider,
                    subject=subject,
                    user_id=user_id,
                    email=email,
                    conn=conn,
                )
            await self._write_sso_activity_event(
                name="auth.sso.linked",
                user_id=user_id,
                provider=provider,
                subject=subject,
                email=email,
                conn=conn,
            )
        return self._redirect_to_frontend_link_result(frontend_base, provider=provider, redirect=redirect)

    async def _write_sso_activity_event(
        self,
        *,
        name: str,
        user_id: UUID,
        provider: str,
        subject: str,
        email: str | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        properties: JsonObject = {
            "provider": provider,
            "subject_hint": hashlib.sha256(subject.encode("utf-8")).hexdigest()[:16],
        }
        if email is not None:
            properties["email_domain"] = email.rsplit("@", 1)[-1].lower() if "@" in email else None
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=name,
                actor_user_id=user_id,
                subject_user_id=user_id,
                entity_type="auth_sso_identity",
                entity_id=user_id,
                source="api",
                properties=properties,
            ),
            conn=conn,
        )

    async def _auto_accept_email_invites(self, *, user_id: UUID, email: str) -> None:
        try:
            from src.models.workspaces.workspace_invite import WorkspaceEmailInvite

            user = await self.repo.get_user_by_id(user_id=user_id)
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
                    from src.common.invitations.tokens import build_invite_token
                    from src.modules.auth.schema import AcceptExistingInvitationRequest

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
            url = cast(dict[str, object], site).get("url") if isinstance(site, dict) else None
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

    async def _load_core_oauth_config(self, section_ids: tuple[str, ...]) -> dict[str, Any]:
        core = await get_core_settings_value_cached(self.settings, ttl_seconds=2.0)
        if not isinstance(core, dict):
            return {}
        # Keep only the sections owned by sys oauth namespace.
        out: dict[str, Any] = {}
        for key in [*section_ids, "oauth_provisioning", "auth"]:
            val = core.get(key)
            if isinstance(val, dict):
                out[key] = val
        return out

    async def _is_public_register_allowed(self, *, email: str | None) -> bool:
        from src.modules.auth.registration.service import get_public_register_policy

        policy = await get_public_register_policy(self.settings)
        if not policy.enabled:
            return False
        if policy.require_email and not (email or "").strip():
            return False
        if not policy.is_email_allowed(email):
            return False
        return True

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
