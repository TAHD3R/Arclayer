from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Query, Request

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.infra.limiter.limiter import rate_limit
from apps.api.modules.auth.constants import SSO_EXCHANGE_RATE_LIMIT, SSO_PROVIDERS_RATE_LIMIT
from apps.api.modules.auth.deps import get_current_user
from apps.api.modules.auth.schema import TokenPair
from apps.api.modules.auth.service import AuthService
from apps.api.modules.auth.sso.schema import (
    AuthSSOExchangeIn,
    AuthSSOLinkStateOut,
    AuthSSOProviderItem,
    AuthSSOProvidersOut,
)
from apps.api.modules.auth.sso.service import AuthSSOService
from apps.api.modules.organization.models.user import User
from apps.api.plugin.manager import PluginManager

router = APIRouter(prefix="/sso", tags=["Services: Auth SSO"])

_SSO_LINK_STATE_EXPIRES_IN = 10 * 60
_SSO_LINK_STATE_KEY_PREFIX = "auth:sso:link_state:"


def get_plugin_manager(request: Request) -> PluginManager:
    manager = getattr(request.app.state, "plugin_manager", None)
    if manager is None:
        raise ServiceUnavailable(message="Plugin manager unavailable", error="PLUGIN_MANAGER_UNAVAILABLE")
    return manager


def get_auth_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return AuthService(settings, valkey=valkey)


def get_sso_service(
    request: Request,
    settings: Settings = Depends(get_settings),
    manager: PluginManager = Depends(get_plugin_manager),
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthSSOService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return AuthSSOService(settings, manager=manager, valkey=valkey, auth_service=auth_service)


@router.get(
    "/providers",
    response_model=ResponseModel[AuthSSOProvidersOut],
    dependencies=[rate_limit(*SSO_PROVIDERS_RATE_LIMIT)],
    summary="List enabled SSO providers for current instance",
)
async def list_providers(
    request: Request,
    redirect: str | None = Query(default=None, description="Optional safe redirect path after login."),
    service: AuthSSOService = Depends(get_sso_service),
) -> ResponseModel[AuthSSOProvidersOut]:
    items = await service.list_providers(request, redirect=redirect)
    providers = [AuthSSOProviderItem.model_validate(x) for x in items]
    return Response.success(data=AuthSSOProvidersOut(providers=providers))


@router.post(
    "/exchange",
    response_model=ResponseModel[TokenPair],
    dependencies=[rate_limit(*SSO_EXCHANGE_RATE_LIMIT)],
    summary="Exchange a one-time OAuth/SSO code for a token pair",
)
async def exchange(
    payload: AuthSSOExchangeIn,
    service: AuthSSOService = Depends(get_sso_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.exchange(code=payload.code)
    return Response.success(data=tokens)


@router.post(
    "/link-state",
    response_model=ResponseModel[AuthSSOLinkStateOut],
    summary="Issue a one-time token for linking an OAuth identity to current user",
)
async def issue_link_state(
    request: Request,
    user: User = Depends(get_current_user),
) -> ResponseModel[AuthSSOLinkStateOut]:
    """
    Issue a short-lived token used by public OAuth start endpoints to bind the upcoming
    OAuth callback to the current authenticated user (account linking flow).
    """
    try:
        valkey = get_valkey(request)
    except RuntimeError as exc:
        raise ServiceUnavailable(message="Valkey unavailable", error="VALKEY_UNAVAILABLE") from exc

    token = secrets.token_urlsafe(32)
    await valkey.set(f"{_SSO_LINK_STATE_KEY_PREFIX}{token}", str(user.id), ex=_SSO_LINK_STATE_EXPIRES_IN)
    return Response.success(data=AuthSSOLinkStateOut(token=token, expires_in=_SSO_LINK_STATE_EXPIRES_IN))
