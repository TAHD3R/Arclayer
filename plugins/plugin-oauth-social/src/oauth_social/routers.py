from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from starlette.responses import RedirectResponse

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.infra.cache.valkey import get_valkey
from apps.api.infra.limiter.limiter import rate_limit
from apps.api.plugin.manager import PluginManager

from oauth_social.service import OAuthSocialService

public_router = APIRouter()


def get_plugin_manager(request: Request) -> PluginManager:
    manager = getattr(request.app.state, "plugin_manager", None)
    if manager is None:
        raise ServiceUnavailable(message="Plugin manager unavailable", error="PLUGIN_MANAGER_UNAVAILABLE")
    return manager


def get_service(
    request: Request,
    settings: Settings = Depends(get_settings),
    manager: PluginManager = Depends(get_plugin_manager),
) -> OAuthSocialService:
    try:
        valkey = get_valkey(request)
    except RuntimeError as exc:
        raise ServiceUnavailable(message="Valkey unavailable", error="VALKEY_UNAVAILABLE") from exc

    if not manager.descriptors:
        manager.discover()
    desc = manager.descriptors.get("plugin-oauth-social")
    if desc is None:
        raise ServiceUnavailable(message="OAuth plugin unavailable", error="OAUTH_PLUGIN_UNAVAILABLE")

    return OAuthSocialService(settings, manifest=desc.manifest, valkey=valkey)


@public_router.get(
    "/start/{provider}",
    summary="Start OAuth social login flow",
    name="oauth_social_start",
    dependencies=[rate_limit(20, 60)],
)
async def start_oauth(
    provider: str,
    request: Request,
    redirect: str | None = Query(default=None, description="Optional safe redirect path after login."),
    service: OAuthSocialService = Depends(get_service),
) -> RedirectResponse:
    return await service.start(request, provider=provider, redirect=redirect)


@public_router.get(
    "/callback/{provider}",
    summary="OAuth social login callback",
    name="oauth_social_callback",
    dependencies=[rate_limit(20, 60)],
)
async def callback_oauth(
    provider: str,
    request: Request,
    code: str | None = Query(default=None, description="Authorization code."),
    state: str | None = Query(default=None, description="OAuth state."),
    service: OAuthSocialService = Depends(get_service),
) -> RedirectResponse:
    return await service.callback(request, provider=provider, code=code, state=state)
