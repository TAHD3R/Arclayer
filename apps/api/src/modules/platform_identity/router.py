from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.core.middleware.guard_decorators import guard_rate_limit
from src.modules.auth.limits.service import LOGIN_RATE_LIMIT, TWO_FACTOR_LOGIN_RATE_LIMIT, TWO_FACTOR_SETUP_RATE_LIMIT
from src.modules.auth.sessions.device_label import build_device_label
from src.modules.platform_identity.auth_factory import build_platform_auth_service
from src.modules.platform_identity.auth_schema import (
    PlatformSessionIssuedOut,
    PlatformSignInOut,
    PlatformSignInRequest,
    PlatformTotpChallengeRequest,
    PlatformTotpSetupConfirmRequest,
    PlatformTotpSetupOut,
    PlatformTotpSetupRequest,
    PlatformWebAuthnAuthenticationBeginOut,
    PlatformWebAuthnAuthenticationCompleteRequest,
    PlatformWebAuthnBeginRequest,
    PlatformWebAuthnRegistrationBeginOut,
    PlatformWebAuthnRegistrationCompleteRequest,
)
from src.modules.platform_identity.auth_service import PlatformAuthService

router = APIRouter(prefix="/auth", tags=["platform.auth"])


def get_platform_auth_service(settings: Settings = Depends(get_settings)) -> PlatformAuthService:
    return build_platform_auth_service(settings)


def _device_label(request: Request) -> str:
    return build_device_label(request.headers.get("user-agent"))


@guard_rate_limit(*LOGIN_RATE_LIMIT)
@router.post("/sign-in", response_model=ResponseModel[PlatformSignInOut], summary="Start Platform sign-in")
async def sign_in(
    payload: PlatformSignInRequest,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformSignInOut]:
    return ApiResponse.success(data=await service.sign_in(identifier=payload.identifier, password=payload.password))


@guard_rate_limit(*TWO_FACTOR_SETUP_RATE_LIMIT)
@router.post(
    "/mfa/authenticator-app/setup",
    response_model=ResponseModel[PlatformTotpSetupOut],
    summary="Start authenticator-app setup",
)
async def begin_totp_setup(
    payload: PlatformTotpSetupRequest,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformTotpSetupOut]:
    return ApiResponse.success(data=await service.begin_totp_setup(flow_token=payload.flow_token))


@guard_rate_limit(*TWO_FACTOR_SETUP_RATE_LIMIT)
@router.post(
    "/mfa/authenticator-app/setup/confirm",
    response_model=ResponseModel[PlatformSessionIssuedOut],
    summary="Verify authenticator-app setup and establish Platform access",
)
async def confirm_totp_setup(
    payload: PlatformTotpSetupConfirmRequest,
    request: Request,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformSessionIssuedOut]:
    result = await service.confirm_totp_setup(
        flow_token=payload.flow_token,
        method_id=payload.method_id,
        code=payload.code,
        device_label=_device_label(request),
    )
    return ApiResponse.success(data=result)


@guard_rate_limit(*TWO_FACTOR_LOGIN_RATE_LIMIT)
@router.post(
    "/mfa/authenticator-app/challenge",
    response_model=ResponseModel[PlatformSessionIssuedOut],
    summary="Complete Platform verification with an authenticator app",
)
async def complete_totp_challenge(
    payload: PlatformTotpChallengeRequest,
    request: Request,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformSessionIssuedOut]:
    result = await service.complete_totp_challenge(
        flow_token=payload.flow_token,
        method_id=payload.method_id,
        code=payload.code,
        device_label=_device_label(request),
    )
    return ApiResponse.success(data=result)


@guard_rate_limit(*TWO_FACTOR_SETUP_RATE_LIMIT)
@router.post(
    "/mfa/security-key/setup/options",
    response_model=ResponseModel[PlatformWebAuthnRegistrationBeginOut],
    summary="Start security-key or passkey setup",
)
async def begin_webauthn_registration(
    payload: PlatformWebAuthnBeginRequest,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformWebAuthnRegistrationBeginOut]:
    return ApiResponse.success(data=await service.begin_webauthn_registration(flow_token=payload.flow_token))


@guard_rate_limit(*TWO_FACTOR_SETUP_RATE_LIMIT)
@router.post(
    "/mfa/security-key/setup/complete",
    response_model=ResponseModel[PlatformSessionIssuedOut],
    summary="Verify security-key or passkey setup and establish Platform access",
)
async def complete_webauthn_registration(
    payload: PlatformWebAuthnRegistrationCompleteRequest,
    request: Request,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformSessionIssuedOut]:
    result = await service.complete_webauthn_registration(
        flow_token=payload.flow_token,
        challenge_id=payload.challenge_id,
        credential=payload.credential,
        device_label=_device_label(request),
    )
    return ApiResponse.success(data=result)


@guard_rate_limit(*TWO_FACTOR_LOGIN_RATE_LIMIT)
@router.post(
    "/mfa/security-key/challenge/options",
    response_model=ResponseModel[PlatformWebAuthnAuthenticationBeginOut],
    summary="Start security-key or passkey verification",
)
async def begin_webauthn_authentication(
    payload: PlatformWebAuthnBeginRequest,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformWebAuthnAuthenticationBeginOut]:
    return ApiResponse.success(data=await service.begin_webauthn_authentication(flow_token=payload.flow_token))


@guard_rate_limit(*TWO_FACTOR_LOGIN_RATE_LIMIT)
@router.post(
    "/mfa/security-key/challenge/complete",
    response_model=ResponseModel[PlatformSessionIssuedOut],
    summary="Complete Platform verification with a security key or passkey",
)
async def complete_webauthn_authentication(
    payload: PlatformWebAuthnAuthenticationCompleteRequest,
    request: Request,
    service: PlatformAuthService = Depends(get_platform_auth_service),
) -> ResponseModel[PlatformSessionIssuedOut]:
    result = await service.complete_webauthn_authentication(
        flow_token=payload.flow_token,
        challenge_id=payload.challenge_id,
        credential=payload.credential,
        device_label=_device_label(request),
    )
    return ApiResponse.success(data=result)
