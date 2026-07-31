from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import NamedTuple, cast
from uuid import UUID

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from src.core.services import BaseService
from src.models.organization.user import UserStatus
from src.models.platform_identity.identity import PlatformOperatorStatus
from src.models.platform_identity.mfa import PlatformAuthFlowPurpose, PlatformMfaMethodKind
from src.models.platform_identity.operations import PlatformVerificationAssurance
from src.modules.platform_identity.auth_contracts import (
    PlatformAuthCredentialLike,
    PlatformAuthFlowPort,
    PlatformAuthIdentityPort,
    PlatformAuthMethodLike,
    PlatformAuthMfaPort,
    PlatformAuthOperatorLike,
    PlatformAuthUserLike,
    PlatformAuthUserPort,
    PlatformAuthWebAuthnPort,
    PlatformSessionIssuer,
)
from src.modules.platform_identity.auth_schema import (
    PlatformAuthMethodKind,
    PlatformAuthMethodOut,
    PlatformAuthState,
    PlatformSessionIssuedOut,
    PlatformSignInOut,
    PlatformTotpSetupOut,
    PlatformWebAuthnAuthenticationBeginOut,
    PlatformWebAuthnRegistrationBeginOut,
)
from src.modules.platform_identity.mfa_schema import PlatformMfaAssurance, PlatformRecoveryCodeSet
from src.modules.platform_identity.webauthn_schema import (
    PlatformAuthFlowRecord,
    PlatformWebAuthnAuthenticationCredential,
    PlatformWebAuthnRegistrationCredential,
)


class _AccessState(NamedTuple):
    user: PlatformAuthUserLike
    user_id: UUID
    identity_revision: int
    is_owner: bool
    operator: PlatformAuthOperatorLike | None
    methods: tuple[PlatformAuthMethodLike, ...]


class PlatformAuthService(BaseService):
    """Identity-authenticated Platform MFA flows that never issue Product credentials."""

    def __init__(
        self,
        *,
        users: PlatformAuthUserPort,
        identity: PlatformAuthIdentityPort,
        flows: PlatformAuthFlowPort,
        mfa: PlatformAuthMfaPort,
        webauthn: PlatformAuthWebAuthnPort,
        issue_session: PlatformSessionIssuer,
        verify_password: Callable[[str, str], bool],
        issuer_name: str,
        settings: Settings | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        super().__init__(settings)
        self._users = users
        self._identity = identity
        self._flows = flows
        self._mfa = mfa
        self._webauthn = webauthn
        self._issue_session = issue_session
        self._verify_password = verify_password
        self._issuer_name = issuer_name
        self._now = now or (lambda: datetime.now(UTC))

    async def sign_in(self, *, identifier: str, password: str) -> PlatformSignInOut:
        user = await self._users.get_by_identifier(identifier)
        credential = None if user is None else cast(PlatformAuthCredentialLike | None, user.credential)
        password_hash = "" if credential is None else credential.password_hash
        if user is None or not isinstance(password_hash, str) or not password_hash:
            raise Unauthorized(error="PLATFORM_INVALID_CREDENTIALS")
        if not self._verify_password(password, password_hash):
            raise Unauthorized(error="PLATFORM_INVALID_CREDENTIALS")

        access = await self._resolve_access(user)
        if access.is_owner and not self._has_method(access.methods, PlatformMfaMethodKind.WEBAUTHN):
            return await self._issue_flow(
                access=access,
                purpose=PlatformAuthFlowPurpose.SETUP,
                state=PlatformAuthState.PHISHING_RESISTANT_SETUP_REQUIRED,
            )
        if not access.methods or self._operator_requires_setup(access.operator):
            return await self._issue_flow(
                access=access,
                purpose=PlatformAuthFlowPurpose.SETUP,
                state=PlatformAuthState.MFA_SETUP_REQUIRED,
            )
        return await self._issue_flow(
            access=access,
            purpose=PlatformAuthFlowPurpose.LOGIN_MFA,
            state=PlatformAuthState.MFA_CHALLENGE_REQUIRED,
        )

    async def begin_totp_setup(self, *, flow_token: str) -> PlatformTotpSetupOut:
        flow, access = await self._require_flow(token=flow_token, purpose=PlatformAuthFlowPurpose.SETUP)
        self._require_operator_setup(access)
        self._require_no_verified_methods(access)
        setup = await self._mfa.begin_totp_setup(
            user_id=flow.user_id,
            issuer=self._issuer_name,
            account_label=self._account_label(access.user),
        )
        return PlatformTotpSetupOut(setup=setup)

    async def confirm_totp_setup(
        self, *, flow_token: str, method_id: UUID, code: str, device_label: str | None
    ) -> PlatformSessionIssuedOut:
        flow, access = await self._require_flow(token=flow_token, purpose=PlatformAuthFlowPurpose.SETUP)
        operator = self._require_operator_setup(access)
        self._require_no_verified_methods(access)
        try:
            recovery_codes = await self._mfa.confirm_totp_setup(
                user_id=flow.user_id,
                method_id=method_id,
                code=code,
                operator_id=UUID(str(operator.id)),
            )
        except (BadRequest, Conflict, NotFound):
            await self._flows.record_failure(flow_id=flow.flow_id)
            raise
        if recovery_codes is None:
            raise RuntimeError("Platform Operator TOTP setup completed without recovery codes")
        await self._flows.consume(flow_id=flow.flow_id)
        return await self._session_out(
            user_id=flow.user_id,
            assurance=PlatformVerificationAssurance.LOCAL_MFA,
            device_label=device_label,
            recovery_codes=recovery_codes,
        )

    async def complete_totp_challenge(
        self, *, flow_token: str, method_id: UUID, code: str, device_label: str | None
    ) -> PlatformSessionIssuedOut:
        flow, access = await self._require_flow(token=flow_token, purpose=PlatformAuthFlowPurpose.LOGIN_MFA)
        if access.is_owner and not self._has_method(access.methods, PlatformMfaMethodKind.WEBAUTHN):
            raise Forbidden(error="PLATFORM_SECURITY_KEY_REQUIRED")
        try:
            verification = await self._mfa.verify_totp_for_baseline(
                user_id=flow.user_id, method_id=method_id, code=code
            )
        except (BadRequest, Conflict, NotFound):
            await self._flows.record_failure(flow_id=flow.flow_id)
            raise
        if verification.assurance != PlatformMfaAssurance.BASELINE:
            raise Forbidden(error="PLATFORM_MFA_ASSURANCE_INVALID")
        await self._flows.consume(flow_id=flow.flow_id)
        return await self._session_out(
            user_id=flow.user_id,
            assurance=PlatformVerificationAssurance.LOCAL_MFA,
            device_label=device_label,
        )

    async def begin_webauthn_registration(self, *, flow_token: str) -> PlatformWebAuthnRegistrationBeginOut:
        _flow, access = await self._require_flow(token=flow_token, purpose=PlatformAuthFlowPurpose.SETUP)
        if not access.is_owner:
            raise Forbidden(error="PLATFORM_OWNER_WEBAUTHN_SETUP_REQUIRED")
        if self._has_method(access.methods, PlatformMfaMethodKind.WEBAUTHN):
            raise Conflict(error="PLATFORM_MFA_SETUP_STATE_CHANGED")
        options = await self._webauthn.begin_registration(
            user_id=access.user_id,
            user_name=str(access.user.username),
            display_name=str(access.user.display_name or access.user.username),
            binding=flow_token,
        )
        return PlatformWebAuthnRegistrationBeginOut(options=options)

    async def complete_webauthn_registration(
        self,
        *,
        flow_token: str,
        challenge_id: UUID,
        credential: PlatformWebAuthnRegistrationCredential,
        device_label: str | None,
    ) -> PlatformSessionIssuedOut:
        flow, access = await self._require_flow(token=flow_token, purpose=PlatformAuthFlowPurpose.SETUP)
        if not access.is_owner:
            raise Forbidden(error="PLATFORM_OWNER_WEBAUTHN_SETUP_REQUIRED")
        if self._has_method(access.methods, PlatformMfaMethodKind.WEBAUTHN):
            raise Conflict(error="PLATFORM_MFA_SETUP_STATE_CHANGED")
        enrollment = await self._webauthn.complete_registration(
            user_id=flow.user_id,
            challenge_id=challenge_id,
            binding=flow_token,
            credential=credential,
        )
        if enrollment.assurance != PlatformMfaAssurance.PHISHING_RESISTANT:
            raise Forbidden(error="PLATFORM_MFA_ASSURANCE_INVALID")
        await self._flows.consume(flow_id=flow.flow_id)
        return await self._session_out(
            user_id=flow.user_id,
            assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
            device_label=device_label,
        )

    async def begin_webauthn_authentication(self, *, flow_token: str) -> PlatformWebAuthnAuthenticationBeginOut:
        flow, _access = await self._require_flow(token=flow_token, purpose=PlatformAuthFlowPurpose.LOGIN_MFA)
        options = await self._webauthn.begin_authentication(user_id=flow.user_id, binding=flow_token)
        return PlatformWebAuthnAuthenticationBeginOut(options=options)

    async def complete_webauthn_authentication(
        self,
        *,
        flow_token: str,
        challenge_id: UUID,
        credential: PlatformWebAuthnAuthenticationCredential,
        device_label: str | None,
    ) -> PlatformSessionIssuedOut:
        flow, _access = await self._require_flow(token=flow_token, purpose=PlatformAuthFlowPurpose.LOGIN_MFA)
        verification = await self._webauthn.complete_authentication(
            user_id=flow.user_id,
            challenge_id=challenge_id,
            binding=flow_token,
            credential=credential,
        )
        if verification.assurance != PlatformMfaAssurance.PHISHING_RESISTANT:
            raise Forbidden(error="PLATFORM_MFA_ASSURANCE_INVALID")
        await self._flows.consume(flow_id=flow.flow_id)
        return await self._session_out(
            user_id=flow.user_id,
            assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
            device_label=device_label,
        )

    async def _resolve_access(self, user: PlatformAuthUserLike) -> _AccessState:
        if str(user.status) != UserStatus.ACTIVE.value:
            raise Forbidden(error="PLATFORM_IDENTITY_UNAVAILABLE")
        user_id = UUID(str(user.id))
        is_owner = await self._identity.is_instance_owner(user_id=user_id)
        operator = await self._identity.get_operator_by_user_id(user_id=user_id)
        if not is_owner and not self._operator_can_authenticate(operator):
            raise Forbidden(error="PLATFORM_ACCESS_REQUIRED")
        revision = user.token_version
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
            raise RuntimeError("Platform auth identity has an invalid revision")
        methods = tuple(await self._identity.list_verified_mfa_methods(user_id=user_id))
        return _AccessState(
            user=user,
            user_id=user_id,
            identity_revision=revision,
            is_owner=is_owner,
            operator=operator,
            methods=methods,
        )

    async def _issue_flow(
        self,
        *,
        access: _AccessState,
        purpose: PlatformAuthFlowPurpose,
        state: PlatformAuthState,
    ) -> PlatformSignInOut:
        issued = await self._flows.issue(
            user_id=access.user_id,
            purpose=purpose,
            identity_revision=access.identity_revision,
        )
        expires_in = max(int((issued.expires_at - self._now()).total_seconds()), 1)
        return PlatformSignInOut(
            state=state,
            flow_token=issued.token,
            expires_in=expires_in,
            methods=self._method_outputs(access.methods),
        )

    async def _require_flow(
        self, *, token: str, purpose: PlatformAuthFlowPurpose
    ) -> tuple[PlatformAuthFlowRecord, _AccessState]:
        flow = await self._flows.require(token=token, purpose=purpose)
        user = await self._users.get_by_id_with_credential(flow.user_id)
        if user is None or user.credential is None:
            raise Unauthorized(error="PLATFORM_IDENTITY_CHANGED")
        access = await self._resolve_access(user)
        if access.identity_revision != flow.identity_revision:
            raise Unauthorized(error="PLATFORM_IDENTITY_CHANGED")
        return flow, access

    async def _session_out(
        self,
        *,
        user_id: UUID,
        assurance: PlatformVerificationAssurance,
        device_label: str | None,
        recovery_codes: PlatformRecoveryCodeSet | None = None,
    ) -> PlatformSessionIssuedOut:
        credential = await self._issue_session(
            actor_id=user_id,
            assurance=assurance,
            device_label=self._normalize_device_label(device_label),
        )
        return PlatformSessionIssuedOut(credential=credential, recovery_codes=recovery_codes)

    @staticmethod
    def _operator_can_authenticate(operator: PlatformAuthOperatorLike | None) -> bool:
        return operator is not None and str(operator.status) in {
            PlatformOperatorStatus.ACTIVE.value,
            PlatformOperatorStatus.MFA_SETUP_REQUIRED.value,
        }

    @staticmethod
    def _operator_requires_setup(operator: PlatformAuthOperatorLike | None) -> bool:
        return operator is not None and str(operator.status) == PlatformOperatorStatus.MFA_SETUP_REQUIRED.value

    @staticmethod
    def _require_operator_setup(access: _AccessState) -> PlatformAuthOperatorLike:
        if access.is_owner:
            raise Forbidden(error="PLATFORM_SECURITY_KEY_REQUIRED")
        if access.operator is None:
            raise Forbidden(error="PLATFORM_ACCESS_REQUIRED")
        return access.operator

    @staticmethod
    def _require_no_verified_methods(access: _AccessState) -> None:
        if access.methods:
            raise Conflict(error="PLATFORM_MFA_SETUP_STATE_CHANGED")

    @staticmethod
    def _has_method(methods: Sequence[PlatformAuthMethodLike], kind: PlatformMfaMethodKind) -> bool:
        return any(str(method.kind) == kind.value for method in methods)

    @classmethod
    def _method_outputs(cls, methods: Sequence[PlatformAuthMethodLike]) -> tuple[PlatformAuthMethodOut, ...]:
        return tuple(
            PlatformAuthMethodOut(
                method_id=UUID(str(method.id)),
                kind=cls._method_kind(method),
                label=cast(str | None, method.label),
            )
            for method in methods
        )

    @staticmethod
    def _method_kind(method: PlatformAuthMethodLike) -> PlatformAuthMethodKind:
        if str(method.kind) == PlatformMfaMethodKind.WEBAUTHN.value:
            return PlatformAuthMethodKind.SECURITY_KEY_OR_PASSKEY
        if str(method.kind) == PlatformMfaMethodKind.TOTP.value:
            return PlatformAuthMethodKind.AUTHENTICATOR_APP
        raise RuntimeError(f"Unsupported Platform MFA method kind: {method.kind!s}")

    @staticmethod
    def _account_label(user: PlatformAuthUserLike) -> str:
        return str(user.email or user.username)

    @staticmethod
    def _normalize_device_label(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None
