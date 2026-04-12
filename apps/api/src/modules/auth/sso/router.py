from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Query, Request
from starlette.responses import RedirectResponse

from src.config import Settings, get_settings
from src.core.exceptions import ServiceUnavailable
from src.core.http.response import Response, ResponseModel
from src.infra.cache.valkey import get_valkey
from src.infra.limiter.limiter import rate_limit
from src.models.auth.oauth_identity import OAuthIdentity
from src.models.organization.user import User, UserCredential
from src.modules.auth.http.service import get_current_user
from src.modules.auth.limits.service import SSO_EXCHANGE_RATE_LIMIT, SSO_PROVIDERS_RATE_LIMIT
from src.modules.auth.login.service import AuthLoginService
from src.modules.auth.oauth.schema import OAuthLinkedIdentityListOut
from src.modules.auth.oauth.service import OAuthSocialService
from src.modules.auth.schema import TokenPair
from src.modules.auth.service import AuthService
from src.modules.auth.sessions.request_context import build_auth_request_context
from src.modules.auth.sso.schema import (
    AuthSSOExchangeIn,
    AuthSSOLinkStateOut,
    AuthSSOProviderItem,
    AuthSSOProvidersOut,
)
from src.modules.auth.sso.service import AuthSSOService
from src.modules.auth.two_factor.service import AuthTwoFactorService

router = APIRouter(prefix="/sso", tags=["Services: Auth SSO"])

_SSO_LINK_STATE_EXPIRES_IN = 10 * 60
_SSO_LINK_STATE_KEY_PREFIX = "auth:sso:link_state:"


def get_auth_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return AuthService(settings, valkey=valkey)


def get_login_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AuthLoginService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    auth_service = AuthService(settings, valkey=valkey)
    two_factor = AuthTwoFactorService(settings)
    return AuthLoginService(settings, valkey=valkey, auth_service=auth_service, two_factor=two_factor)


def get_sso_service(
    request: Request,
    settings: Settings = Depends(get_settings),
    login_service: AuthLoginService = Depends(get_login_service),
) -> AuthSSOService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return AuthSSOService(settings, valkey=valkey, login_service=login_service)


def get_oauth_social_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> OAuthSocialService:
    try:
        valkey = get_valkey(request)
    except RuntimeError as exc:
        raise ServiceUnavailable(message="Valkey unavailable", error="VALKEY_UNAVAILABLE") from exc
    return OAuthSocialService(settings, valkey=valkey)


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
    request: Request,
    service: AuthSSOService = Depends(get_sso_service),
) -> ResponseModel[TokenPair]:
    tokens = await service.exchange(code=payload.code, request_context=build_auth_request_context(request))
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


@router.get(
    "/start/{provider}",
    summary="Start OAuth social login flow",
    name="auth_sso_oauth_start",
    dependencies=[rate_limit(20, 60)],
)
async def start_oauth(
    provider: str,
    request: Request,
    redirect: str | None = Query(default=None, description="Optional safe redirect path after login."),
    link_state: str | None = Query(default=None, description="Optional one-time link state token."),
    service: OAuthSocialService = Depends(get_oauth_social_service),
) -> RedirectResponse:
    return await service.start(request, provider=provider, redirect=redirect, link_state=link_state)


@router.get(
    "/callback/{provider}",
    summary="OAuth social login callback",
    name="auth_sso_oauth_callback",
    dependencies=[rate_limit(20, 60)],
)
async def callback_oauth(
    provider: str,
    request: Request,
    code: str | None = Query(default=None, description="Authorization code."),
    state: str | None = Query(default=None, description="OAuth state."),
    service: OAuthSocialService = Depends(get_oauth_social_service),
) -> RedirectResponse:
    return await service.callback(request, provider=provider, code=code, state=state)


@router.get(
    "/me/identities",
    response_model=ResponseModel[OAuthLinkedIdentityListOut],
    summary="List linked OAuth identities for current user",
)
async def list_my_oauth_identities(
    user: User = Depends(get_current_user),
    service: OAuthSocialService = Depends(get_oauth_social_service),
) -> ResponseModel[OAuthLinkedIdentityListOut]:
    out = await service.list_identities_out(user_id=user.id)
    return Response.success(data=out)


@router.delete(
    "/me/identities/{provider}",
    response_model=ResponseModel[None],
    summary="Unlink an OAuth identity for current user",
)
async def unlink_my_oauth_identity(
    provider: str,
    user: User = Depends(get_current_user),
    service: OAuthSocialService = Depends(get_oauth_social_service),
) -> ResponseModel[None]:
    provider_key = (provider or "").strip().lower()
    if not provider_key:
        return Response.success(data=None)

    # Safety: prevent users from locking themselves out (no password + last identity).
    has_password = await UserCredential.get_or_none(user_id=user.id) is not None
    identities = await OAuthIdentity.filter(user_id=user.id).all()
    has_other_identity = any((i.provider or "").strip().lower() != provider_key for i in identities)
    if not has_password and not has_other_identity:
        return Response.fail(message="Cannot unlink the last sign-in method.", error="LAST_SIGNIN_METHOD")

    await service.unlink_identity(user_id=user.id, provider=provider_key)
    return Response.success(data=None)
