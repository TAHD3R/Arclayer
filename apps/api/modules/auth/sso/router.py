from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from apps.api.config import Settings, get_settings
from apps.api.core.exceptions import ServiceUnavailable
from apps.api.core.http.response import Response, ResponseModel
from apps.api.infra.cache.valkey import get_valkey
from apps.api.infra.limiter.limiter import rate_limit
from apps.api.modules.auth.constants import SSO_EXCHANGE_RATE_LIMIT, SSO_PROVIDERS_RATE_LIMIT
from apps.api.modules.auth.schema import TokenPair
from apps.api.modules.auth.service import AuthService
from apps.api.modules.auth.sso.schema import AuthSSOExchangeIn, AuthSSOProviderItem, AuthSSOProvidersOut
from apps.api.modules.auth.sso.service import AuthSSOService
from apps.api.plugin.manager import PluginManager

router = APIRouter(prefix="/sso", tags=["Services: Auth SSO"])


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
