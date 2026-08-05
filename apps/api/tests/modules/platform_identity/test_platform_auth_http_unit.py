from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.routing import APIRoute

from src.core.exceptions import Conflict, Forbidden, Unauthorized
from src.models.platform_identity.identity import PlatformOperatorSetupReason, PlatformOperatorStatus
from src.models.platform_identity.mfa import PlatformAuthFlowPurpose, PlatformMfaMethodKind
from src.models.platform_identity.operations import PlatformVerificationAssurance
from src.modules.platform_identity.auth_schema import PlatformAuthState
from src.modules.platform_identity.auth_service import PlatformAuthService
from src.modules.platform_identity.mfa_schema import (
    PlatformMfaAssurance,
    PlatformMfaSetupState,
    PlatformMfaVerification,
    PlatformRecoveryCodeSet,
    PlatformTotpSetup,
)
from src.modules.platform_identity.schema import PlatformInvitationSetupContext
from src.modules.platform_identity.session_schema import PlatformSessionCredential, PlatformSessionPrincipal
from src.modules.platform_identity.webauthn_schema import (
    PlatformAuthFlowIssued,
    PlatformAuthFlowRecord,
    PlatformWebAuthnAttestationResponse,
    PlatformWebAuthnEnrollmentResult,
    PlatformWebAuthnRegistrationCredential,
)

_FLOW_TTL_SECONDS = 300


def test_platform_auth_http_routes_exist_only_in_the_platform_composition() -> None:
    from src.core.registry import create_app, create_platform_app

    product_paths = {route.path for route in create_app().routes if isinstance(route, APIRoute)}
    platform_paths = {route.path for route in create_platform_app().routes if isinstance(route, APIRoute)}

    assert "/platform-api/v1/auth/sign-in" in platform_paths
    assert "/platform-api/v1/auth/invitations/{invitation_id}/accept" in platform_paths
    assert "/platform-api/v1/auth/mfa/authenticator-app/challenge" in platform_paths
    assert "/platform-api/v1/auth/mfa/security-key/challenge/complete" in platform_paths
    assert all(not path.startswith("/platform-api/v1/auth/") for path in product_paths)
    assert "/api/v1/auth/login" not in platform_paths


@pytest.mark.asyncio
async def test_owner_password_sign_in_requires_security_key_setup_without_issuing_a_session() -> None:
    owner = _user()
    harness = _Harness(owner=owner)
    harness.identity.methods[owner.id] = [_method(PlatformMfaMethodKind.TOTP)]

    result = await harness.service.sign_in(identifier=owner.username, password="correct-password")

    assert result.state == PlatformAuthState.PHISHING_RESISTANT_SETUP_REQUIRED
    assert harness.flows.last_purpose == PlatformAuthFlowPurpose.SETUP
    assert harness.sessions == []
    assert not hasattr(result, "access_token")
    with pytest.raises(Forbidden, match="PLATFORM_SECURITY_KEY_REQUIRED"):
        await harness.service.begin_totp_setup(flow_token=result.flow_token)


@pytest.mark.asyncio
async def test_wrong_password_does_not_disclose_platform_membership_or_create_a_flow() -> None:
    owner = _user()
    harness = _Harness(owner=owner)

    with pytest.raises(Unauthorized, match="PLATFORM_INVALID_CREDENTIALS"):
        await harness.service.sign_in(identifier=owner.username, password="wrong-password")

    assert harness.flows.records == {}


@pytest.mark.asyncio
async def test_product_identity_without_platform_authority_is_denied_before_a_flow_is_created() -> None:
    product_user = _user()
    harness = _Harness(user=product_user)

    with pytest.raises(Forbidden, match="PLATFORM_ACCESS_REQUIRED"):
        await harness.service.sign_in(identifier=product_user.username, password="correct-password")

    assert harness.flows.records == {}


@pytest.mark.asyncio
async def test_invitation_acceptance_creates_only_mfa_setup_authority_until_verification() -> None:
    invited_user = _user()
    harness = _Harness(user=invited_user)
    invitation_id = uuid4()
    harness.invitation_acceptance.invitation_id = invitation_id

    accepted = await harness.service.accept_invitation(
        invitation_id=invitation_id,
        expected_invitation_revision=1,
        identifier=invited_user.username,
        password="correct-password",
        idempotency_key="accept-invitation",
        correlation_id=uuid4(),
    )

    assert accepted.state == PlatformAuthState.MFA_SETUP_REQUIRED
    assert harness.identity.operator.status == PlatformOperatorStatus.MFA_SETUP_REQUIRED
    assert harness.sessions == []

    setup = await harness.service.begin_totp_setup(flow_token=accepted.flow_token)
    await harness.service.confirm_totp_setup(
        flow_token=accepted.flow_token,
        method_id=setup.setup.method_id,
        code="123456",
        device_label="Test Browser on Test Device",
    )

    assert harness.identity.operator.status == PlatformOperatorStatus.ACTIVE
    assert harness.sessions == [PlatformVerificationAssurance.LOCAL_MFA]


@pytest.mark.asyncio
async def test_privileged_invitation_requires_security_key_before_atomic_activation() -> None:
    invited_user = _user()
    harness = _Harness(user=invited_user)
    invitation_id = uuid4()
    harness.invitation_acceptance.invitation_id = invitation_id
    harness.invitation_acceptance.requires_phishing_resistant = True

    accepted = await harness.service.accept_invitation(
        invitation_id=invitation_id,
        expected_invitation_revision=1,
        identifier=invited_user.username,
        password="correct-password",
        idempotency_key="accept-privileged-invitation",
        correlation_id=uuid4(),
    )

    assert accepted.state == PlatformAuthState.PHISHING_RESISTANT_SETUP_REQUIRED
    with pytest.raises(Forbidden, match="PLATFORM_SECURITY_KEY_REQUIRED"):
        await harness.service.begin_totp_setup(flow_token=accepted.flow_token)

    result = await harness.service.complete_webauthn_registration(
        flow_token=accepted.flow_token,
        challenge_id=uuid4(),
        credential=_registration_credential(),
        device_label="Test Browser on Test Device",
    )

    assert result.recovery_codes is not None
    assert harness.identity.operator.status == PlatformOperatorStatus.ACTIVE
    assert harness.sessions == [PlatformVerificationAssurance.PHISHING_RESISTANT]


@pytest.mark.asyncio
async def test_operator_totp_setup_issues_recovery_codes_and_a_platform_only_session() -> None:
    operator_user = _user()
    harness = _Harness(user=operator_user, operator_status=PlatformOperatorStatus.MFA_SETUP_REQUIRED)
    sign_in = await harness.service.sign_in(identifier=operator_user.username, password="correct-password")

    setup = await harness.service.begin_totp_setup(flow_token=sign_in.flow_token)
    result = await harness.service.confirm_totp_setup(
        flow_token=sign_in.flow_token,
        method_id=setup.setup.method_id,
        code="123456",
        device_label="Test Browser on Test Device",
    )

    assert sign_in.state == PlatformAuthState.MFA_SETUP_REQUIRED
    assert result.state == PlatformAuthState.AUTHENTICATED
    assert result.recovery_codes is not None
    assert result.credential.access_token == "platform-session-token"
    assert harness.sessions == [PlatformVerificationAssurance.LOCAL_MFA]
    assert harness.flows.consumed


@pytest.mark.asyncio
async def test_totp_login_flow_is_durable_single_use() -> None:
    operator_user = _user()
    harness = _Harness(user=operator_user, operator_status=PlatformOperatorStatus.ACTIVE)
    method = _method(PlatformMfaMethodKind.TOTP)
    harness.identity.methods[operator_user.id] = [method]
    sign_in = await harness.service.sign_in(identifier=operator_user.username, password="correct-password")

    await harness.service.complete_totp_challenge(
        flow_token=sign_in.flow_token,
        method_id=method.id,
        code="123456",
        device_label=None,
    )

    with pytest.raises(Conflict, match="PLATFORM_AUTH_FLOW_CONSUMED"):
        await harness.service.complete_totp_challenge(
            flow_token=sign_in.flow_token,
            method_id=method.id,
            code="654321",
            device_label=None,
        )


@pytest.mark.asyncio
async def test_owner_webauthn_setup_is_the_only_bootstrap_path_that_issues_a_session() -> None:
    owner = _user()
    harness = _Harness(owner=owner)
    sign_in = await harness.service.sign_in(identifier=owner.username, password="correct-password")

    result = await harness.service.complete_webauthn_registration(
        flow_token=sign_in.flow_token,
        challenge_id=uuid4(),
        credential=_registration_credential(),
        device_label="Test Browser on Test Device",
    )

    assert result.credential.access_token == "platform-session-token"
    assert harness.sessions == [PlatformVerificationAssurance.PHISHING_RESISTANT]
    assert harness.webauthn.registration_completed_for == [owner.id]


@pytest.mark.asyncio
async def test_identity_revision_drift_invalidates_an_authenticated_mfa_flow() -> None:
    operator_user = _user()
    harness = _Harness(user=operator_user, operator_status=PlatformOperatorStatus.ACTIVE)
    harness.identity.methods[operator_user.id] = [_method(PlatformMfaMethodKind.TOTP)]
    sign_in = await harness.service.sign_in(identifier=operator_user.username, password="correct-password")
    operator_user.token_version += 1

    with pytest.raises(Unauthorized, match="PLATFORM_IDENTITY_CHANGED"):
        await harness.service.complete_totp_challenge(
            flow_token=sign_in.flow_token,
            method_id=harness.identity.methods[operator_user.id][0].id,
            code="123456",
            device_label=None,
        )


def _user():
    user_id = uuid4()
    return SimpleNamespace(
        id=user_id,
        username=f"user-{user_id.hex[:8]}",
        email=f"{user_id.hex[:8]}@example.com",
        display_name="Platform User",
        status="active",
        token_version=1,
        credential=SimpleNamespace(password_hash="shared-password-hash"),
    )


def _method(kind: PlatformMfaMethodKind):
    return SimpleNamespace(id=uuid4(), kind=kind, label=None)


def _registration_credential() -> PlatformWebAuthnRegistrationCredential:
    return PlatformWebAuthnRegistrationCredential(
        id="credential-id",
        raw_id="credential-id",
        response=PlatformWebAuthnAttestationResponse(
            client_data_json="client-data",
            attestation_object="attestation",
        ),
    )


class _Users:
    def __init__(self, user) -> None:
        self.user = user

    async def get_by_identifier(self, identifier: str):
        return self.user if identifier in {self.user.username, self.user.email} else None

    async def get_by_id_with_credential(self, user_id: UUID):
        return self.user if self.user.id == user_id else None


class _Identity:
    def __init__(self, *, owner_id: UUID | None, user_id: UUID, operator_status: PlatformOperatorStatus | None) -> None:
        self.owner_id = owner_id
        self.operator = (
            None
            if operator_status is None
            else SimpleNamespace(
                id=uuid4(),
                user_id=user_id,
                status=operator_status,
                setup_reason=(
                    PlatformOperatorSetupReason.RECOVERY
                    if operator_status == PlatformOperatorStatus.MFA_SETUP_REQUIRED
                    else None
                ),
            )
        )
        self.methods: dict[UUID, list[SimpleNamespace]] = {}
        self.setup_context: PlatformInvitationSetupContext | None = None

    async def is_instance_owner(self, *, user_id: UUID) -> bool:
        return user_id == self.owner_id

    async def get_operator_by_user_id(self, *, user_id: UUID):
        return self.operator if self.operator is not None and self.operator.user_id == user_id else None

    async def get_operator_setup_context(self, *, user_id: UUID):
        if self.operator is None or self.operator.user_id != user_id:
            return None
        return self.setup_context

    async def list_verified_mfa_methods(self, *, user_id: UUID):
        return self.methods.get(user_id, [])


class _Flows:
    def __init__(self) -> None:
        self.records: dict[str, PlatformAuthFlowRecord] = {}
        self.consumed: set[UUID] = set()
        self.last_purpose: PlatformAuthFlowPurpose | None = None

    async def issue(
        self,
        *,
        user_id: UUID,
        purpose: PlatformAuthFlowPurpose,
        identity_revision: int,
        setup_context: PlatformInvitationSetupContext | None = None,
    ):
        token = f"flow-{uuid4().hex}-{uuid4().hex}"
        flow_id = uuid4()
        expires_at = datetime.now(UTC) + timedelta(seconds=_FLOW_TTL_SECONDS)
        self.records[token] = PlatformAuthFlowRecord(
            flow_id=flow_id,
            user_id=user_id,
            purpose=purpose,
            identity_revision=identity_revision,
            invitation_id=None if setup_context is None else setup_context.invitation_id,
            invitation_revision=None if setup_context is None else setup_context.invitation_revision,
            requires_phishing_resistant=(False if setup_context is None else setup_context.requires_phishing_resistant),
            expires_at=expires_at,
            failure_count=0,
        )
        self.last_purpose = purpose
        return PlatformAuthFlowIssued(flow_id=flow_id, token=token, expires_at=expires_at)

    async def require(self, *, token: str, purpose: PlatformAuthFlowPurpose):
        record = self.records.get(token)
        if record is None or record.purpose != purpose:
            raise Unauthorized(error="PLATFORM_AUTH_FLOW_INVALID")
        if record.flow_id in self.consumed:
            raise Conflict(error="PLATFORM_AUTH_FLOW_CONSUMED")
        return record

    async def record_failure(self, *, flow_id: UUID):
        record = self._by_id(flow_id)
        updated = record.model_copy(update={"failure_count": record.failure_count + 1})
        self.records = {token: updated if item.flow_id == flow_id else item for token, item in self.records.items()}
        return updated

    async def consume(self, *, flow_id: UUID):
        record = self._by_id(flow_id)
        if flow_id in self.consumed:
            raise Conflict(error="PLATFORM_AUTH_FLOW_CONSUMED")
        self.consumed.add(flow_id)
        return record

    def _by_id(self, flow_id: UUID) -> PlatformAuthFlowRecord:
        return next(item for item in self.records.values() if item.flow_id == flow_id)


class _Mfa:
    def __init__(self, identity: _Identity) -> None:
        self.identity = identity
        self.pending_method_id = uuid4()

    async def begin_totp_setup(self, *, user_id: UUID, issuer: str, account_label: str):
        return PlatformTotpSetup(
            method_id=self.pending_method_id,
            state=PlatformMfaSetupState.PENDING_VERIFICATION,
            secret="PLATFORMTOTPSECRET",
            issuer=issuer,
            account_label=account_label,
        )

    async def confirm_totp_setup(
        self,
        *,
        user_id: UUID,
        method_id: UUID,
        code: str,
        operator_id: UUID | None = None,
        **_activation,
    ):
        assert method_id == self.pending_method_id
        assert code == "123456"
        assert operator_id is not None
        assert self.identity.operator is not None
        self.identity.operator.status = PlatformOperatorStatus.ACTIVE
        self.identity.operator.setup_reason = None
        self.identity.setup_context = None
        return PlatformRecoveryCodeSet(state=PlatformMfaSetupState.VERIFIED, codes=("ABCD-EFGH-JK",))

    async def verify_totp_for_baseline(self, *, user_id: UUID, method_id: UUID, code: str):
        return PlatformMfaVerification(method_id=method_id, assurance=PlatformMfaAssurance.BASELINE)


class _WebAuthn:
    def __init__(self, identity: _Identity) -> None:
        self.identity = identity
        self.registration_completed_for: list[UUID] = []

    async def complete_registration(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential,
        operator_id: UUID | None = None,
        **_activation,
    ):
        self.registration_completed_for.append(user_id)
        recovery_codes = None
        if operator_id is not None:
            assert self.identity.operator is not None
            self.identity.operator.status = PlatformOperatorStatus.ACTIVE
            self.identity.operator.setup_reason = None
            self.identity.setup_context = None
            recovery_codes = PlatformRecoveryCodeSet(
                state=PlatformMfaSetupState.VERIFIED,
                codes=("ABCD-EFGH-JK",),
            )
        return PlatformWebAuthnEnrollmentResult(method_id=uuid4(), recovery_codes=recovery_codes)


class _InvitationAcceptance:
    def __init__(self, *, identity: _Identity, user_id: UUID) -> None:
        self.identity = identity
        self.user_id = user_id
        self.invitation_id = uuid4()
        self.requires_phishing_resistant = False

    async def begin_operator_invitation_acceptance(self, *, command):
        assert command.invitation_id == self.invitation_id
        assert command.accepter_user_id == self.user_id
        operator = self.identity.operator or SimpleNamespace(id=uuid4(), user_id=self.user_id)
        operator.status = PlatformOperatorStatus.MFA_SETUP_REQUIRED
        operator.setup_reason = PlatformOperatorSetupReason.INVITATION
        self.identity.operator = operator
        context = PlatformInvitationSetupContext(
            invitation_id=command.invitation_id,
            invitation_revision=command.expected_invitation_revision + 1,
            operator_id=operator.id,
            requires_phishing_resistant=self.requires_phishing_resistant,
        )
        self.identity.setup_context = context
        return context


class _Harness:
    def __init__(
        self,
        *,
        user=None,
        owner=None,
        operator_status: PlatformOperatorStatus | None = None,
    ) -> None:
        resolved_user = owner or user
        assert resolved_user is not None
        self.identity = _Identity(
            owner_id=None if owner is None else owner.id,
            user_id=resolved_user.id,
            operator_status=operator_status,
        )
        self.flows = _Flows()
        self.mfa = _Mfa(self.identity)
        self.webauthn = _WebAuthn(self.identity)
        self.invitation_acceptance = _InvitationAcceptance(identity=self.identity, user_id=resolved_user.id)
        self.sessions: list[PlatformVerificationAssurance] = []
        operator = self.identity.operator
        operator_id = None if operator is None else operator.id

        async def _issue_session(*, actor_id: UUID, assurance, device_label: str | None):
            self.sessions.append(assurance)
            return PlatformSessionCredential(
                access_token="platform-session-token",
                expires_in=900,
                session=PlatformSessionPrincipal(
                    actor_id=actor_id,
                    session_id=uuid4(),
                    operator_id=operator_id,
                    is_instance_owner=owner is not None,
                    policy_revision=1,
                    absolute_expires_at=datetime.now(UTC) + timedelta(hours=8),
                ),
            )

        self.service = PlatformAuthService(
            users=_Users(resolved_user),
            identity=self.identity,
            invitation_acceptance=self.invitation_acceptance,
            flows=self.flows,
            mfa=self.mfa,
            webauthn=self.webauthn,
            issue_session=_issue_session,
            verify_password=lambda password, hashed: (
                password == "correct-password" and hashed == "shared-password-hash"
            ),
            issuer_name="Arclayer Platform",
        )
