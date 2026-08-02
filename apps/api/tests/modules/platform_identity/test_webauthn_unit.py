from __future__ import annotations

import json
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from webauthn.helpers import bytes_to_base64url, encode_cbor

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict
from src.models.platform_identity.mfa import PlatformMfaMethodKind, PlatformWebAuthnChallengePurpose
from src.modules.platform_identity.mfa_schema import PlatformMfaAssurance
from src.modules.platform_identity.webauthn import (
    PlatformWebAuthnPersistence,
    PlatformWebAuthnService,
    PlatformWebAuthnVerifier,
    VerifiedPlatformWebAuthnAuthentication,
    VerifiedPlatformWebAuthnRegistration,
)
from src.modules.platform_identity.webauthn_schema import (
    PlatformWebAuthnAssertionResponse,
    PlatformWebAuthnAttestationResponse,
    PlatformWebAuthnAuthenticationCredential,
    PlatformWebAuthnRegistrationCredential,
)
from src.settings.env_models import PlatformAuthSettings

_NOW = datetime(2026, 7, 30, 8, 0, tzinfo=UTC)
_ORIGIN = "https://platform.arclayer.localhost"
_RP_ID = "arclayer.localhost"


@pytest.mark.asyncio
async def test_registration_challenge_is_hashed_bound_and_requires_user_verification() -> None:
    repo = _MemoryWebAuthnPersistence()
    verifier = _ContractVerifier(registration_user_verified=True)
    service = _service(repo=repo, verifier=verifier)
    user_id = uuid4()

    options = await service.begin_registration(
        user_id=user_id,
        user_name="owner@example.com",
        display_name="Owner",
        binding="owner-bootstrap:revision-1",
    )

    challenge = repo.challenges[options.challenge_id]
    assert challenge.challenge_hash != options.challenge
    assert len(challenge.challenge_hash) == 64
    assert challenge.binding_hash != "owner-bootstrap:revision-1"
    assert options.rp.id == _RP_ID
    assert options.authenticator_selection.user_verification == "required"

    result = await service.complete_registration(
        user_id=user_id,
        challenge_id=options.challenge_id,
        binding="owner-bootstrap:revision-1",
        credential=_registration_credential(),
    )

    assert result.assurance == PlatformMfaAssurance.PHISHING_RESISTANT
    assert repo.methods[0].kind == PlatformMfaMethodKind.WEBAUTHN
    assert verifier.registration_expectation == (_ORIGIN, _RP_ID, True)


@pytest.mark.asyncio
async def test_registration_denies_unverified_user_and_consumes_the_challenge() -> None:
    repo = _MemoryWebAuthnPersistence()
    verifier = _ContractVerifier(registration_user_verified=False)
    service = _service(repo=repo, verifier=verifier)
    user_id = uuid4()
    options = await service.begin_registration(
        user_id=user_id,
        user_name="owner@example.com",
        display_name="Owner",
        binding="setup-flow",
    )

    with pytest.raises(BadRequest) as first:
        await service.complete_registration(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="setup-flow",
            credential=_registration_credential(),
        )
    assert first.value.error == "PLATFORM_WEBAUTHN_USER_VERIFICATION_REQUIRED"

    with pytest.raises(Conflict) as replay:
        await service.complete_registration(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="setup-flow",
            credential=_registration_credential(),
        )
    assert replay.value.error == "PLATFORM_WEBAUTHN_CHALLENGE_USED_OR_INVALID"


@pytest.mark.asyncio
async def test_registration_fails_closed_when_real_verifier_rejects_invalid_payload() -> None:
    repo = _MemoryWebAuthnPersistence()
    service = PlatformWebAuthnService(
        repository=cast(PlatformWebAuthnPersistence, repo),
        settings=_settings(),
        now=lambda: _NOW,
        challenge_factory=lambda: b"C" * 32,
    )
    user_id = uuid4()
    options = await service.begin_registration(
        user_id=user_id,
        user_name="owner@example.com",
        display_name="Owner",
        binding="setup-flow",
    )

    with pytest.raises(BadRequest) as exc:
        await service.complete_registration(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="setup-flow",
            credential=_registration_credential(),
        )
    assert exc.value.error == "PLATFORM_WEBAUTHN_REGISTRATION_INVALID"


@pytest.mark.asyncio
async def test_authentication_advances_signature_counter_and_rejects_replay() -> None:
    repo = _MemoryWebAuthnPersistence()
    user_id = uuid4()
    repo.methods.append(_Method(id=uuid4(), user_id=user_id, sign_count=8))
    verifier = _ContractVerifier(authentication_sign_count=9)
    challenges = iter((b"D" * 32, b"E" * 32))
    service = _service(repo=repo, verifier=verifier, challenge_factory=lambda: next(challenges))

    first = await service.begin_authentication(user_id=user_id, binding="step-up:first")
    result = await service.complete_authentication(
        user_id=user_id,
        challenge_id=first.challenge_id,
        binding="step-up:first",
        credential=_authentication_credential(),
    )
    assert result.assurance == PlatformMfaAssurance.PHISHING_RESISTANT
    assert repo.methods[0].sign_count == 9

    second = await service.begin_authentication(user_id=user_id, binding="step-up:second")
    with pytest.raises(Conflict) as replay:
        await service.complete_authentication(
            user_id=user_id,
            challenge_id=second.challenge_id,
            binding="step-up:second",
            credential=_authentication_credential(),
        )
    assert replay.value.error == "PLATFORM_WEBAUTHN_SIGNATURE_COUNTER_REPLAY"
    assert verifier.authentication_expectation == (_ORIGIN, _RP_ID, True)


@pytest.mark.asyncio
async def test_authentication_rejects_concurrent_counter_compare_and_swap_loss() -> None:
    repo = _MemoryWebAuthnPersistence(fail_counter_cas=True)
    user_id = uuid4()
    repo.methods.append(_Method(id=uuid4(), user_id=user_id, sign_count=3))
    service = _service(repo=repo, verifier=_ContractVerifier(authentication_sign_count=4))
    options = await service.begin_authentication(user_id=user_id, binding="login-flow")

    with pytest.raises(Conflict) as exc:
        await service.complete_authentication(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="login-flow",
            credential=_authentication_credential(),
        )
    assert exc.value.error == "PLATFORM_WEBAUTHN_SIGNATURE_COUNTER_REPLAY"


@pytest.mark.asyncio
async def test_real_webauthn_library_verifies_registration_and_signed_authentication() -> None:
    repo = _MemoryWebAuthnPersistence()
    user_id = uuid4()
    private_key = ec.generate_private_key(ec.SECP256R1())
    credential_id = b"platform-credential-id-00000001"
    challenges = iter((b"R" * 32, b"S" * 32))
    service = PlatformWebAuthnService(
        repository=cast(PlatformWebAuthnPersistence, repo),
        settings=_settings(),
        now=lambda: _NOW,
        challenge_factory=lambda: next(challenges),
    )

    registration = await service.begin_registration(
        user_id=user_id,
        user_name="owner@example.com",
        display_name="Owner",
        binding="owner-setup",
    )
    enrolled = await service.complete_registration(
        user_id=user_id,
        challenge_id=registration.challenge_id,
        binding="owner-setup",
        credential=_real_registration_credential(
            challenge=registration.challenge,
            credential_id=credential_id,
            private_key=private_key,
        ),
    )
    assert enrolled.assurance == PlatformMfaAssurance.PHISHING_RESISTANT

    authentication = await service.begin_authentication(user_id=user_id, binding="owner-login")
    verified = await service.complete_authentication(
        user_id=user_id,
        challenge_id=authentication.challenge_id,
        binding="owner-login",
        credential=_real_authentication_credential(
            challenge=authentication.challenge,
            credential_id=credential_id,
            private_key=private_key,
            sign_count=1,
        ),
    )
    assert verified.assurance == PlatformMfaAssurance.PHISHING_RESISTANT
    assert repo.methods[0].sign_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("origin", "authenticator_rp_id"),
    (
        ("https://other.arclayer.localhost", _RP_ID),
        (_ORIGIN, "other.arclayer.localhost"),
    ),
)
async def test_real_webauthn_library_rejects_origin_or_rp_mismatch(origin: str, authenticator_rp_id: str) -> None:
    repo = _MemoryWebAuthnPersistence()
    service = PlatformWebAuthnService(
        repository=cast(PlatformWebAuthnPersistence, repo),
        settings=_settings(),
        now=lambda: _NOW,
        challenge_factory=lambda: b"T" * 32,
    )
    user_id = uuid4()
    private_key = ec.generate_private_key(ec.SECP256R1())
    options = await service.begin_registration(
        user_id=user_id,
        user_name="owner@example.com",
        display_name="Owner",
        binding="owner-setup",
    )

    with pytest.raises(BadRequest) as exc:
        await service.complete_registration(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="owner-setup",
            credential=_real_registration_credential(
                challenge=options.challenge,
                credential_id=b"platform-credential-id-00000002",
                private_key=private_key,
                origin=origin,
                authenticator_rp_id=authenticator_rp_id,
            ),
        )
    assert exc.value.error == "PLATFORM_WEBAUTHN_REGISTRATION_INVALID"


@pytest.mark.asyncio
async def test_challenge_rejects_changed_binding_and_relying_party_configuration() -> None:
    repo = _MemoryWebAuthnPersistence()
    service = _service(repo=repo, verifier=_ContractVerifier())
    user_id = uuid4()
    options = await service.begin_registration(
        user_id=user_id,
        user_name="owner@example.com",
        display_name="Owner",
        binding="setup-flow",
    )

    with pytest.raises(Conflict) as binding_changed:
        await service.complete_registration(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="another-flow",
            credential=_registration_credential(),
        )
    assert binding_changed.value.error == "PLATFORM_WEBAUTHN_BINDING_CHANGED"


@pytest.mark.asyncio
async def test_management_registration_replaces_only_after_new_webauthn_credential_verifies_and_replays_idempotently() -> (
    None
):
    repo = _MemoryWebAuthnPersistence()
    user_id = uuid4()
    old_method = _Method(id=uuid4(), user_id=user_id, credential_id="previous-credential")
    repo.methods.append(old_method)
    service = _service(repo=repo, verifier=_ContractVerifier())
    binding = "current-session:actor:replacement"
    correlation_id = uuid4()
    options = await service.begin_registration(
        user_id=user_id,
        user_name="operator@example.com",
        display_name="Operator",
        binding=binding,
    )

    result = await service.complete_management_registration(
        user_id=user_id,
        challenge_id=options.challenge_id,
        binding=binding,
        credential=_registration_credential(),
        replace_method_id=old_method.id,
        idempotency_key="replace-method-1",
        correlation_id=correlation_id,
    )

    assert result.method_id != old_method.id
    assert old_method.revoked_at == _NOW
    assert len([method for method in repo.methods if method.revoked_at is None]) == 1

    replay = await service.complete_management_registration(
        user_id=user_id,
        challenge_id=options.challenge_id,
        binding=binding,
        credential=_registration_credential(),
        replace_method_id=old_method.id,
        idempotency_key="replace-method-1",
        correlation_id=correlation_id,
    )
    assert replay.method_id == result.method_id


@pytest.mark.asyncio
async def test_management_registration_binding_failure_leaves_old_method_unchanged() -> None:
    repo = _MemoryWebAuthnPersistence()
    user_id = uuid4()
    old_method = _Method(id=uuid4(), user_id=user_id, credential_id="previous-credential")
    repo.methods.append(old_method)
    service = _service(repo=repo, verifier=_ContractVerifier())
    options = await service.begin_registration(
        user_id=user_id,
        user_name="operator@example.com",
        display_name="Operator",
        binding="bound-session",
    )

    with pytest.raises(Conflict) as exc:
        await service.complete_management_registration(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="different-session",
            credential=_registration_credential(),
            replace_method_id=old_method.id,
            idempotency_key="replace-method-2",
            correlation_id=uuid4(),
        )

    assert exc.value.error == "PLATFORM_WEBAUTHN_BINDING_CHANGED"
    assert old_method.revoked_at is None


@pytest.mark.asyncio
async def test_management_registration_expiry_leaves_old_method_unchanged() -> None:
    repo = _MemoryWebAuthnPersistence()
    user_id = uuid4()
    old_method = _Method(id=uuid4(), user_id=user_id, credential_id="previous-credential")
    repo.methods.append(old_method)
    clock = [_NOW]
    service = PlatformWebAuthnService(
        repository=cast(PlatformWebAuthnPersistence, repo),
        verifier=cast(PlatformWebAuthnVerifier, _ContractVerifier()),
        settings=_settings(),
        now=lambda: clock[0],
        challenge_factory=lambda: b"Z" * 32,
    )
    options = await service.begin_registration(
        user_id=user_id,
        user_name="operator@example.com",
        display_name="Operator",
        binding="current-session:expired",
    )
    clock[0] = _NOW + timedelta(seconds=301)

    with pytest.raises(Conflict) as exc:
        await service.complete_management_registration(
            user_id=user_id,
            challenge_id=options.challenge_id,
            binding="current-session:expired",
            credential=_registration_credential(),
            replace_method_id=old_method.id,
            idempotency_key="replace-method-expired",
            correlation_id=uuid4(),
        )

    assert exc.value.error == "PLATFORM_WEBAUTHN_CHALLENGE_EXPIRED"
    assert old_method.revoked_at is None


def test_webauthn_settings_reject_insecure_non_local_origin_and_unrelated_rp() -> None:
    with pytest.raises(ValueError, match="HTTPS outside localhost"):
        PlatformAuthSettings.WebAuthnSettings(rp_id="example.com", origin="http://platform.example.com")
    with pytest.raises(ValueError, match="equal or be a subdomain"):
        PlatformAuthSettings.WebAuthnSettings(rp_id="example.com", origin="https://platform.invalid")


@dataclass
class _Challenge:
    id: UUID
    user_id: UUID
    purpose: PlatformWebAuthnChallengePurpose
    challenge_hash: str
    binding_hash: str
    relying_party_id: str
    origin: str
    expires_at: datetime
    consumed_at: datetime | None = None


@dataclass
class _Method:
    id: UUID
    user_id: UUID
    credential_id: str = "credential-1"
    credential_public_key: str = "verified-public-key"
    sign_count: int = 0
    relying_party_id: str = _RP_ID
    kind: PlatformMfaMethodKind = PlatformMfaMethodKind.WEBAUTHN
    status: str = "verified"
    verified_at: datetime | None = None
    revoked_at: datetime | None = None
    last_used_at: datetime | None = None


class _MemoryWebAuthnPersistence:
    def __init__(self, *, fail_counter_cas: bool = False) -> None:
        self.challenges: dict[UUID, _Challenge] = {}
        self.methods: list[_Method] = []
        self.fail_counter_cas = fail_counter_cas
        self.management_receipts: dict[tuple[UUID, str, str], tuple[UUID, UUID, str]] = {}

    @asynccontextmanager
    async def transaction(self):
        yield cast(Any, SimpleNamespace())

    async def create_challenge(self, *, values: dict[str, object]):
        record = _Challenge(id=uuid4(), consumed_at=None, **cast(Any, values))
        self.challenges[record.id] = record
        return record

    async def consume_challenge(self, *, challenge_id, user_id, purpose, consumed_at):
        record = self.challenges.get(challenge_id)
        if record is None or record.user_id != user_id or record.purpose != purpose or record.consumed_at is not None:
            return None
        record.consumed_at = consumed_at
        return record

    async def list_verified_methods(self, *, user_id):
        return [method for method in self.methods if method.user_id == user_id and method.revoked_at is None]

    async def create_verified_method(self, *, values, conn):
        credential_id = cast(str, values["credential_id"])
        if any(method.credential_id == credential_id for method in self.methods):
            raise AssertionError("test persistence enforces credential uniqueness")
        method = _Method(id=uuid4(), **cast(Any, values))
        self.methods.append(method)
        return method

    async def get_verified_method(self, *, user_id, credential_id):
        return next(
            (
                method
                for method in self.methods
                if method.user_id == user_id and method.credential_id == credential_id and method.revoked_at is None
            ),
            None,
        )

    async def try_advance_sign_count(self, *, method_id, expected_count, new_count, used_at, conn):
        method = next(method for method in self.methods if method.id == method_id)
        if self.fail_counter_cas or method.sign_count != expected_count:
            return False
        method.sign_count = new_count
        method.last_used_at = used_at
        return True

    async def touch_counterless_method(self, *, method_id, used_at, conn):
        method = next(method for method in self.methods if method.id == method_id)
        if method.sign_count != 0:
            return False
        method.last_used_at = used_at
        return True

    async def get_management_enrollment_replay(
        self, *, user_id, action, idempotency_key, correlation_id, request_fingerprint
    ):
        receipt = self.management_receipts.get((user_id, action, idempotency_key))
        if receipt is None:
            return None
        method_id, stored_correlation_id, stored_fingerprint = receipt
        if stored_correlation_id != correlation_id or stored_fingerprint != request_fingerprint:
            raise Conflict(error="PLATFORM_IDEMPOTENCY_CONFLICT")
        return method_id

    async def commit_management_registration(
        self,
        *,
        values,
        user_id,
        replaced_method_id,
        action,
        idempotency_key,
        correlation_id,
        request_fingerprint,
        occurred_at,
    ):
        existing = await self.get_management_enrollment_replay(
            user_id=user_id,
            action=action,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
            request_fingerprint=request_fingerprint,
        )
        if existing is not None:
            return next(method for method in self.methods if method.id == existing)
        replaced = None
        if replaced_method_id is not None:
            replaced = next(
                (method for method in self.methods if method.id == replaced_method_id and method.user_id == user_id),
                None,
            )
            if replaced is None:
                raise Conflict(error="PLATFORM_MFA_REPLACEMENT_INVALID")
        method = await self.create_verified_method(values=values, conn=object())
        if replaced is not None:
            replaced.revoked_at = occurred_at
            replaced.status = "revoked"
        self.management_receipts[(user_id, action, idempotency_key)] = (
            method.id,
            correlation_id,
            request_fingerprint,
        )
        return method


class _ContractVerifier:
    """Test adapter for service orchestration; it does not claim cryptographic coverage."""

    def __init__(
        self,
        *,
        registration_user_verified: bool = True,
        authentication_sign_count: int = 1,
    ) -> None:
        self.registration_user_verified = registration_user_verified
        self.authentication_sign_count = authentication_sign_count
        self.registration_expectation: tuple[str, str, bool] | None = None
        self.authentication_expectation: tuple[str, str, bool] | None = None

    def verify_registration(self, **kwargs):
        self.registration_expectation = (
            kwargs["expected_origin"],
            kwargs["expected_rp_id"],
            kwargs["require_user_verification"],
        )
        return VerifiedPlatformWebAuthnRegistration(
            credential_id=kwargs["credential"].raw_id,
            credential_public_key="verified-public-key",
            sign_count=0,
            user_verified=self.registration_user_verified,
        )

    def verify_authentication(self, **kwargs):
        self.authentication_expectation = (
            kwargs["expected_origin"],
            kwargs["expected_rp_id"],
            kwargs["require_user_verification"],
        )
        return VerifiedPlatformWebAuthnAuthentication(
            credential_id=kwargs["credential"].raw_id,
            sign_count=self.authentication_sign_count,
            user_verified=True,
        )


def _service(
    *,
    repo: _MemoryWebAuthnPersistence,
    verifier: _ContractVerifier,
    challenge_factory=lambda: b"A" * 32,
) -> PlatformWebAuthnService:
    return PlatformWebAuthnService(
        repository=cast(PlatformWebAuthnPersistence, repo),
        verifier=cast(PlatformWebAuthnVerifier, verifier),
        settings=_settings(),
        now=lambda: _NOW,
        challenge_factory=challenge_factory,
    )


def _settings() -> Settings:
    return Settings(
        platform_auth=PlatformAuthSettings(
            webauthn=PlatformAuthSettings.WebAuthnSettings(
                rp_id=_RP_ID,
                origin=_ORIGIN,
                rp_name="Arclayer Platform",
                challenge_ttl_seconds=300,
                allowed_cose_algorithms=(-7, -257),
            )
        )
    )


def _registration_credential() -> PlatformWebAuthnRegistrationCredential:
    return PlatformWebAuthnRegistrationCredential(
        id="credential-1",
        raw_id="credential-1",
        response=PlatformWebAuthnAttestationResponse(
            client_data_json="encoded-client-data",
            attestation_object="encoded-attestation",
        ),
    )


def _authentication_credential() -> PlatformWebAuthnAuthenticationCredential:
    return PlatformWebAuthnAuthenticationCredential(
        id="credential-1",
        raw_id="credential-1",
        response=PlatformWebAuthnAssertionResponse(
            client_data_json="encoded-client-data",
            authenticator_data="encoded-authenticator-data",
            signature="encoded-signature",
        ),
    )


def _real_registration_credential(
    *,
    challenge: str,
    credential_id: bytes,
    private_key: ec.EllipticCurvePrivateKey,
    origin: str = _ORIGIN,
    authenticator_rp_id: str = _RP_ID,
) -> PlatformWebAuthnRegistrationCredential:
    client_data_json = _client_data_json(ceremony_type="webauthn.create", challenge=challenge, origin=origin)
    numbers = private_key.public_key().public_numbers()
    credential_public_key = encode_cbor({
        1: 2,
        3: -7,
        -1: 1,
        -2: numbers.x.to_bytes(32, "big"),
        -3: numbers.y.to_bytes(32, "big"),
    })
    authenticator_data = (
        sha256(authenticator_rp_id.encode()).digest()
        + bytes([0x45])
        + (0).to_bytes(4, "big")
        + bytes(16)
        + len(credential_id).to_bytes(2, "big")
        + credential_id
        + credential_public_key
    )
    attestation_object = encode_cbor({"fmt": "none", "attStmt": {}, "authData": authenticator_data})
    encoded_credential_id = bytes_to_base64url(credential_id)
    return PlatformWebAuthnRegistrationCredential(
        id=encoded_credential_id,
        raw_id=encoded_credential_id,
        response=PlatformWebAuthnAttestationResponse(
            client_data_json=bytes_to_base64url(client_data_json),
            attestation_object=bytes_to_base64url(attestation_object),
        ),
    )


def _real_authentication_credential(
    *,
    challenge: str,
    credential_id: bytes,
    private_key: ec.EllipticCurvePrivateKey,
    sign_count: int,
) -> PlatformWebAuthnAuthenticationCredential:
    client_data_json = _client_data_json(ceremony_type="webauthn.get", challenge=challenge)
    authenticator_data = sha256(_RP_ID.encode()).digest() + bytes([0x05]) + sign_count.to_bytes(4, "big")
    signature = private_key.sign(authenticator_data + sha256(client_data_json).digest(), ec.ECDSA(hashes.SHA256()))
    encoded_credential_id = bytes_to_base64url(credential_id)
    return PlatformWebAuthnAuthenticationCredential(
        id=encoded_credential_id,
        raw_id=encoded_credential_id,
        response=PlatformWebAuthnAssertionResponse(
            client_data_json=bytes_to_base64url(client_data_json),
            authenticator_data=bytes_to_base64url(authenticator_data),
            signature=bytes_to_base64url(signature),
        ),
    )


def _client_data_json(*, ceremony_type: str, challenge: str, origin: str = _ORIGIN) -> bytes:
    return json.dumps(
        {"type": ceremony_type, "challenge": challenge, "origin": origin, "crossOrigin": False},
        separators=(",", ":"),
    ).encode()
