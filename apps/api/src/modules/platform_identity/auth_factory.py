from __future__ import annotations

from typing import cast
from uuid import UUID

from src.config import Settings
from src.models.platform_identity.operations import PlatformVerificationAssurance
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import verify_password
from src.modules.platform_identity.auth_contracts import PlatformAuthUserPort
from src.modules.platform_identity.auth_service import PlatformAuthService
from src.modules.platform_identity.mfa import PlatformMfaService
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.service import PlatformIdentityAuthorityService
from src.modules.platform_identity.session_schema import PlatformSessionCredential
from src.modules.platform_identity.sessions import issue_platform_session
from src.modules.platform_identity.webauthn import PlatformAuthFlowChallengeRepository, PlatformWebAuthnService


def build_platform_auth_service(settings: Settings) -> PlatformAuthService:
    """Compose Platform auth ports without leaking persistence construction into the HTTP router."""

    identity = PlatformIdentityRepository()

    async def _issue_session(
        *, actor_id: UUID, assurance: PlatformVerificationAssurance, device_label: str | None
    ) -> PlatformSessionCredential:
        return await issue_platform_session(
            actor_id=actor_id,
            assurance=assurance,
            device_label=device_label,
            settings=settings.platform_auth,
            repository=identity,
        )

    flow_ttl_seconds = settings.platform_auth.webauthn.challenge_ttl_seconds
    mfa = PlatformMfaService(settings, invitation_activation=identity)
    return PlatformAuthService(
        users=cast(PlatformAuthUserPort, UserRepository()),
        identity=identity,
        invitation_acceptance=PlatformIdentityAuthorityService(repository=identity, settings=settings),
        flows=PlatformAuthFlowChallengeRepository(ttl_seconds=flow_ttl_seconds),
        mfa=mfa,
        webauthn=PlatformWebAuthnService(settings=settings, operator_setup_completion=mfa),
        issue_session=_issue_session,
        verify_password=lambda plain, hashed: verify_password(plain, hashed, settings.auth),
        issuer_name=settings.platform_auth.webauthn.rp_name,
        settings=settings,
    )
