from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from src.models.platform_identity.mfa import PlatformAuthFlowPurpose
from src.models.platform_identity.operations import PlatformVerificationAssurance
from src.modules.platform_identity.mfa_schema import (
    PlatformMfaVerification,
    PlatformRecoveryCodeSet,
    PlatformTotpSetup,
)
from src.modules.platform_identity.session_schema import PlatformSessionCredential
from src.modules.platform_identity.webauthn_schema import (
    PlatformAuthFlowIssued,
    PlatformAuthFlowRecord,
    PlatformWebAuthnAuthenticationCredential,
    PlatformWebAuthnAuthenticationOptions,
    PlatformWebAuthnEnrollmentResult,
    PlatformWebAuthnRegistrationCredential,
    PlatformWebAuthnRegistrationOptions,
)


class PlatformAuthCredentialLike(Protocol):
    password_hash: object


class PlatformAuthUserLike(Protocol):
    id: object
    username: object
    email: object
    display_name: object
    status: object
    token_version: object
    credential: object


class PlatformAuthOperatorLike(Protocol):
    id: object
    status: object


class PlatformAuthMethodLike(Protocol):
    id: object
    kind: object
    label: object


class PlatformAuthUserPort(Protocol):
    async def get_by_identifier(self, identifier: str) -> PlatformAuthUserLike | None: ...

    async def get_by_id_with_credential(self, user_id: UUID) -> PlatformAuthUserLike | None: ...


class PlatformAuthIdentityPort(Protocol):
    async def is_instance_owner(self, *, user_id: UUID) -> bool: ...

    async def get_operator_by_user_id(self, *, user_id: UUID) -> PlatformAuthOperatorLike | None: ...

    async def list_verified_mfa_methods(self, *, user_id: UUID) -> Sequence[PlatformAuthMethodLike]: ...


class PlatformAuthFlowPort(Protocol):
    async def issue(
        self, *, user_id: UUID, purpose: PlatformAuthFlowPurpose, identity_revision: int
    ) -> PlatformAuthFlowIssued: ...

    async def require(self, *, token: str, purpose: PlatformAuthFlowPurpose) -> PlatformAuthFlowRecord: ...

    async def record_failure(self, *, flow_id: UUID) -> PlatformAuthFlowRecord: ...

    async def consume(self, *, flow_id: UUID) -> PlatformAuthFlowRecord: ...


class PlatformAuthMfaPort(Protocol):
    async def begin_totp_setup(self, *, user_id: UUID, issuer: str, account_label: str) -> PlatformTotpSetup: ...

    async def confirm_totp_setup(
        self, *, user_id: UUID, method_id: UUID, code: str, operator_id: UUID | None = None
    ) -> PlatformRecoveryCodeSet | None: ...

    async def verify_totp_for_baseline(
        self, *, user_id: UUID, method_id: UUID, code: str
    ) -> PlatformMfaVerification: ...


class PlatformAuthWebAuthnPort(Protocol):
    async def begin_registration(
        self, *, user_id: UUID, user_name: str, display_name: str, binding: str
    ) -> PlatformWebAuthnRegistrationOptions: ...

    async def complete_registration(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: PlatformWebAuthnRegistrationCredential,
    ) -> PlatformWebAuthnEnrollmentResult: ...

    async def begin_authentication(self, *, user_id: UUID, binding: str) -> PlatformWebAuthnAuthenticationOptions: ...

    async def complete_authentication(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: PlatformWebAuthnAuthenticationCredential,
    ) -> PlatformMfaVerification: ...


class PlatformSessionIssuer(Protocol):
    async def __call__(
        self, *, actor_id: UUID, assurance: PlatformVerificationAssurance, device_label: str | None
    ) -> PlatformSessionCredential: ...
