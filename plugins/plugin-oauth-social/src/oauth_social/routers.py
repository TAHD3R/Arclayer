from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from starlette.responses import RedirectResponse

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.infra.limiter.limiter import rate_limit
from apps.api.modules.auth.deps import get_current_user
from apps.api.modules.organization.models.user import User, UserCredential
from apps.api.plugin.manager import PluginManager

from oauth_social.service import OAuthSocialService
from oauth_social.schema import OAuthLinkedIdentityListOut, OAuthLinkedIdentityOut

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
    link_state: str | None = Query(default=None, description="Optional one-time link state token."),
    service: OAuthSocialService = Depends(get_service),
) -> RedirectResponse:
    return await service.start(request, provider=provider, redirect=redirect, link_state=link_state)


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


@public_router.get(
    "/me/identities",
    response_model=ResponseModel[OAuthLinkedIdentityListOut],
    summary="List linked OAuth identities for current user",
)
async def list_my_oauth_identities(
    user: User = Depends(get_current_user),
    service: OAuthSocialService = Depends(get_service),
) -> ResponseModel[OAuthLinkedIdentityListOut]:
    rows = await service.list_identities(user_id=user.id)
    identities = [
        OAuthLinkedIdentityOut(
            provider=str(row.provider),
            email=(str(row.email) if row.email is not None else None),
            created_at=row.created_at,
        )
        for row in rows
    ]
    return Response.success(data=OAuthLinkedIdentityListOut(identities=identities))


@public_router.delete(
    "/me/identities/{provider}",
    response_model=ResponseModel[None],
    summary="Unlink an OAuth identity for current user",
)
async def unlink_my_oauth_identity(
    provider: str,
    user: User = Depends(get_current_user),
    service: OAuthSocialService = Depends(get_service),
) -> ResponseModel[None]:
    provider_key = (provider or "").strip().lower()
    if not provider_key:
        return Response.success(data=None)

    # Safety: prevent users from locking themselves out (no password + last identity).
    has_password = await UserCredential.get_or_none(user_id=user.id) is not None
    identities = await service.list_identities(user_id=user.id)
    has_other_identity = any((i.provider or "").strip().lower() != provider_key for i in identities)
    if not has_password and not has_other_identity:
        return Response.fail(message="Cannot unlink the last sign-in method.", error="LAST_SIGNIN_METHOD")

    await service.unlink_identity(user_id=user.id, provider=provider_key)
    return Response.success(data=None)
