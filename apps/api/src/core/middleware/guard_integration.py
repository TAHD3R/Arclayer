from __future__ import annotations

import logging
import re
import secrets
import time
from contextvars import ContextVar
from http.cookies import SimpleCookie
from urllib.parse import urlparse

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
from starlette.types import ASGIApp

from src.config import Settings
from src.core.http.response import ApiResponse as ResponseBuilder
from src.core.i18n import get_request_locale, t
from src.core.middleware.guard_decorators import guard_decorator
from src.settings.env_models import SecuritySettings

_pending_csrf_cookie: ContextVar[str | None] = ContextVar("pending_csrf_cookie", default=None)

_GUARD_SENSITIVE_HEADER_PATTERN = re.compile(
    r"""
    (?P<prefix>['"](?:authorization|cookie|set-cookie)['"]\s*:\s*)
    (?P<value>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")
    """,
    flags=re.IGNORECASE | re.VERBOSE,
)
_GUARD_REDACTED_VALUE = "[REDACTED]"


class _GuardSensitiveHeaderFilter(logging.Filter):
    """Redact credential-bearing request headers from Guard's rendered log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()

        def _redact(match: re.Match[str]) -> str:
            value = match.group("value")
            return f"{match.group('prefix')}{value[0]}{_GUARD_REDACTED_VALUE}{value[-1]}"

        redacted_message = _GUARD_SENSITIVE_HEADER_PATTERN.sub(_redact, message)
        if redacted_message != message:
            record.msg = redacted_message
            record.args = ()
        return True


def _install_guard_sensitive_header_filter(logger: logging.Logger) -> None:
    redaction_filter = next(
        (item for item in logger.filters if isinstance(item, _GuardSensitiveHeaderFilter)),
        None,
    )
    if redaction_filter is None:
        redaction_filter = _GuardSensitiveHeaderFilter()
        logger.addFilter(redaction_filter)

    for handler in logger.handlers:
        if not any(isinstance(item, _GuardSensitiveHeaderFilter) for item in handler.filters):
            handler.addFilter(redaction_filter)


class ArclayerSecurityMiddleware(SecurityMiddleware):
    def __init__(self, app: ASGIApp, *, config: GuardSecurityConfig) -> None:
        super().__init__(app, config=config)
        _install_guard_sensitive_header_filter(self.logger)

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


def _get_request_path(guard_request: GuardRequest) -> str:
    request = _get_starlette_request(guard_request)
    if request is not None:
        return request.url.path

    path = getattr(guard_request, "path", None)
    if isinstance(path, str) and path:
        return path
    return "/"


def _csrf_failure_response(guard_request: GuardRequest) -> StarletteGuardResponse:
    request = _get_starlette_request(guard_request)
    locale = get_request_locale(request)
    payload = ResponseBuilder.fail(
        message=t("errors", "CSRF_FAILED", locale=locale),
        error="CSRF_FAILED",
        meta={"reason": "token_mismatch"},
    )
    return StarletteGuardResponse(JSONResponse(payload.model_dump(), status_code=403))


def _csrf_origin_failure_response(guard_request: GuardRequest, *, reason: str) -> StarletteGuardResponse:
    request = _get_starlette_request(guard_request)
    locale = get_request_locale(request)
    payload = ResponseBuilder.fail(
        message=t("errors", "CSRF_FAILED", locale=locale),
        error="CSRF_FAILED",
        meta={"reason": reason},
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


def _path_matches_prefix(path: str, prefixes: list[str]) -> bool:
    normalized_path = path if path.startswith("/") else f"/{path}"
    for prefix in prefixes:
        normalized_prefix = prefix.rstrip("/") or "/"
        if normalized_path == normalized_prefix or normalized_path.startswith(f"{normalized_prefix}/"):
            return True
    return False


def _is_csrf_protected_path(path: str, csrf_settings: SecuritySettings.CSRFSettings) -> bool:
    if _path_matches_prefix(path, csrf_settings.exempt_path_prefixes):
        return False
    return _path_matches_prefix(path, csrf_settings.protected_path_prefixes)


def _origin_from_url(value: str) -> str | None:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    port = f":{parsed.port}" if parsed.port is not None else ""
    return f"{parsed.scheme}://{parsed.hostname.lower()}{port}"


def _request_origin(guard_request: GuardRequest) -> str | None:
    origin = guard_request.headers.get("origin")
    if origin:
        return _origin_from_url(origin)

    referer = guard_request.headers.get("referer")
    if referer:
        return _origin_from_url(referer)

    return None


def _expected_origin(guard_request: GuardRequest) -> str | None:
    host = guard_request.headers.get("host")
    if not host:
        return None

    proto = guard_request.headers.get("x-forwarded-proto") or "http"
    first_proto = proto.split(",", maxsplit=1)[0].strip().lower()
    scheme = first_proto if first_proto in {"http", "https"} else "http"
    return _origin_from_url(f"{scheme}://{host}")


def _is_allowed_origin(guard_request: GuardRequest, csrf_settings: SecuritySettings.CSRFSettings) -> bool:
    actual = _request_origin(guard_request)
    if actual is None:
        return False

    trusted = {_origin for raw in csrf_settings.trusted_origins if (_origin := _origin_from_url(raw))}
    if actual in trusted:
        return True

    expected = _expected_origin(guard_request)
    return actual == expected


def _build_guard_request_check(csrf_settings: SecuritySettings.CSRFSettings):
    safe_methods = {method.upper() for method in csrf_settings.safe_methods}

    async def _request_check(request: GuardRequest) -> GuardResponse | None:
        _pending_csrf_cookie.set(None)
        if not csrf_settings.enabled:
            return None

        if not _is_csrf_protected_path(_get_request_path(request), csrf_settings):
            return None

        if request.method.upper() in safe_methods:
            if _get_cookie_value(request, csrf_settings.cookie_name) is None:
                _pending_csrf_cookie.set(secrets.token_urlsafe(csrf_settings.token_bytes))
            return None

        if not _is_allowed_origin(request, csrf_settings):
            return _csrf_origin_failure_response(request, reason="origin_mismatch")

        header_token = request.headers.get(csrf_settings.header_name)
        cookie_token = _get_cookie_value(request, csrf_settings.cookie_name)
        if not header_token or not cookie_token or header_token != cookie_token:
            return _csrf_failure_response(request)

        _pending_csrf_cookie.set(secrets.token_urlsafe(csrf_settings.token_bytes))
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
    guard_decorator.config = config
    app.state.guard_decorator = guard_decorator

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
    app.state.guard_decorator = None
    await _reset_guard_singletons(config)
