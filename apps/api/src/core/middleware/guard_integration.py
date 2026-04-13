from __future__ import annotations

import secrets
import time
from contextvars import ContextVar
from http.cookies import SimpleCookie

from fastapi import FastAPI, Request
from guard import (
    RedisManager,
    cloud_handler,
    ip_ban_manager,
    sus_patterns_handler,
)
from guard import (
    SecurityConfig as GuardSecurityConfig,
)
from guard.adapters import StarletteGuardRequest, StarletteGuardResponse
from guard.middleware import SecurityMiddleware
from guard_core.handlers.ratelimit_handler import RateLimitManager
from guard_core.protocols.request_protocol import GuardRequest
from guard_core.protocols.response_protocol import GuardResponse
from starlette.responses import JSONResponse

from src.config import Settings
from src.config_runtime import SecuritySettings
from src.core.http.response import ApiResponse as ResponseBuilder
from src.core.i18n import get_request_locale, t

_pending_csrf_cookie: ContextVar[str | None] = ContextVar("pending_csrf_cookie", default=None)


class ArclayerSecurityMiddleware(SecurityMiddleware):
    async def refresh_cloud_ip_ranges(self) -> None:
        if not self.config.block_cloud_providers:
            return

        if self.config.enable_redis and self.redis_handler:
            await cloud_handler.refresh_async(
                self.config.block_cloud_providers,
                ttl=self.config.cloud_ip_refresh_interval,
            )
        else:
            await cloud_handler.refresh(self.config.block_cloud_providers)
        self.last_cloud_ip_refresh = int(time.time())


def _get_starlette_request(guard_request: GuardRequest) -> Request | None:
    if isinstance(guard_request, StarletteGuardRequest):
        return guard_request._request

    request = getattr(guard_request, "_request", None)
    if isinstance(request, Request):
        return request
    return None


def _get_cookie_value(guard_request: GuardRequest, cookie_name: str) -> str | None:
    cookie_header = guard_request.headers.get("cookie")
    if not cookie_header:
        return None

    cookie = SimpleCookie()
    cookie.load(cookie_header)
    morsel = cookie.get(cookie_name)
    if morsel is None:
        return None
    return morsel.value or None


def _csrf_failure_response(guard_request: GuardRequest) -> StarletteGuardResponse:
    request = _get_starlette_request(guard_request)
    locale = get_request_locale(request)
    payload = ResponseBuilder.fail(
        message=t("errors", "CSRF_FAILED", locale=locale, default="CSRF validation failed"),
        error="CSRF_FAILED",
        meta={"reason": "token_mismatch"},
    )
    return StarletteGuardResponse(JSONResponse(payload.model_dump(), status_code=403))


def _build_set_cookie_header(token: str, csrf_settings: SecuritySettings.CSRFSettings) -> str:
    cookie = SimpleCookie()
    cookie[csrf_settings.cookie_name] = token
    cookie[csrf_settings.cookie_name]["path"] = "/"
    cookie[csrf_settings.cookie_name]["samesite"] = csrf_settings.cookie_samesite
    if csrf_settings.cookie_secure:
        cookie[csrf_settings.cookie_name]["secure"] = True
    if csrf_settings.cookie_httponly:
        cookie[csrf_settings.cookie_name]["httponly"] = True
    return cookie.output(header="").strip()


def _build_guard_request_check(csrf_settings: SecuritySettings.CSRFSettings):
    safe_methods = {method.upper() for method in csrf_settings.safe_methods}

    async def _request_check(request: GuardRequest) -> GuardResponse | None:
        _pending_csrf_cookie.set(None)
        if not csrf_settings.enabled:
            return None

        if request.method.upper() in safe_methods:
            if _get_cookie_value(request, csrf_settings.cookie_name) is None:
                _pending_csrf_cookie.set(secrets.token_urlsafe(csrf_settings.token_bytes))
            return None

        header_token = request.headers.get(csrf_settings.header_name)
        cookie_token = _get_cookie_value(request, csrf_settings.cookie_name)
        if not header_token or not cookie_token or header_token != cookie_token:
            return _csrf_failure_response(request)

        return None

    return _request_check


def _build_guard_response_modifier(csrf_settings: SecuritySettings.CSRFSettings):
    async def _response_modifier(response: GuardResponse) -> GuardResponse:
        token = _pending_csrf_cookie.get()
        if token is None:
            return response

        if isinstance(response, StarletteGuardResponse):
            response._response.set_cookie(
                csrf_settings.cookie_name,
                token,
                secure=csrf_settings.cookie_secure,
                httponly=csrf_settings.cookie_httponly,
                samesite=csrf_settings.cookie_samesite,
            )
            _pending_csrf_cookie.set(None)
            return response

        response.headers["set-cookie"] = _build_set_cookie_header(token, csrf_settings)
        _pending_csrf_cookie.set(None)
        return response

    return _response_modifier


def build_guard_config(settings: Settings) -> GuardSecurityConfig:
    payload = settings.security.model_dump(
        mode="python",
        exclude={
            "enabled",
            "master_key_path",
            "signing_private_key_path",
            "signing_public_key_path",
            "csrf",
            "custom_penetration_patterns",
        },
    )
    payload["custom_request_check"] = _build_guard_request_check(settings.security.csrf)
    payload["custom_response_modifier"] = _build_guard_response_modifier(settings.security.csrf)
    return GuardSecurityConfig(**payload)


async def _reset_guard_singletons(config: GuardSecurityConfig | None) -> None:
    ip_ban_manager.banned_ips.clear()
    ip_ban_manager.redis_handler = None
    ip_ban_manager.agent_handler = None

    if config is not None:
        rate_limit_manager = RateLimitManager(config)
        rate_limit_manager.request_timestamps.clear()
        rate_limit_manager.redis_handler = None
        rate_limit_manager.agent_handler = None
        rate_limit_manager.rate_limit_script_sha = None

    cloud_handler.redis_handler = None
    cloud_handler.agent_handler = None
    await sus_patterns_handler.reset()


async def _sync_custom_penetration_patterns(patterns: list[str]) -> None:
    current = set(await sus_patterns_handler.get_custom_patterns())
    desired = set(patterns)

    for pattern in current - desired:
        await sus_patterns_handler.remove_pattern(pattern, custom=True)

    for pattern in desired - current:
        await sus_patterns_handler.add_pattern(pattern, custom=True)


async def initialize_guard_runtime(app: FastAPI, settings: Settings) -> None:
    if not settings.security.enabled:
        return

    config = build_guard_config(settings)
    await _reset_guard_singletons(config)
    app.state.guard_security_config = config

    redis_manager: RedisManager | None = None
    if config.enable_redis:
        redis_manager = RedisManager(config)
        await redis_manager.initialize()
        await ip_ban_manager.initialize_redis(redis_manager)
        # Guard uses a singleton RateLimitManager underneath the middleware. Initialize
        # the instance explicitly so Redis-backed rate limiting is actually active.
        await RateLimitManager(config).initialize_redis(redis_manager)
        await sus_patterns_handler.initialize_redis(redis_manager)
        if config.block_cloud_providers:
            await cloud_handler.initialize_redis(
                redis_manager,
                config.block_cloud_providers,
                ttl=config.cloud_ip_refresh_interval,
            )

    await _sync_custom_penetration_patterns(settings.security.custom_penetration_patterns)
    app.state.guard_redis_manager = redis_manager


async def close_guard_runtime(app: FastAPI) -> None:
    config: GuardSecurityConfig | None = getattr(app.state, "guard_security_config", None)
    redis_manager: RedisManager | None = getattr(app.state, "guard_redis_manager", None)
    if redis_manager is not None:
        await redis_manager.close()
    app.state.guard_redis_manager = None
    await _reset_guard_singletons(config)
