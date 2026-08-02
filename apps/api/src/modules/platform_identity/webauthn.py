from __future__ import annotations

import hmac
import json
from collections.abc import AsyncIterator, Callable, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_bytes, token_urlsafe
from typing import Any, Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.expressions import F
from tortoise.transactions import in_transaction
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url, options_to_json, parse_client_data_json
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable, Unauthorized
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.core.services import BaseService
from src.models.analytics.audit_event import AuditEvent
from src.models.platform_identity.mfa import (
    PlatformAuthFlowChallenge,
    PlatformAuthFlowPurpose,
    PlatformMfaMethod,
    PlatformMfaMethodKind,
    PlatformMfaMethodStatus,
    PlatformWebAuthnChallenge,
    PlatformWebAuthnChallengePurpose,
)
from src.models.platform_identity.roles import PlatformIdentityMutationReceipt
from src.modules.platform_identity.mfa import PlatformMfaRepository
from src.modules.platform_identity.mfa_schema import (
    PlatformMfaAssurance,
    PlatformMfaVerification,
    PlatformRecoveryCodeSet,
)
from src.modules.platform_identity.schema import PlatformInvitationSetupContext
from src.modules.platform_identity.webauthn_schema import (
    PlatformAuthFlowIssued,
    PlatformAuthFlowRecord,
    PlatformWebAuthnAuthenticationCredential,
    PlatformWebAuthnAuthenticationOptions,
    PlatformWebAuthnCredentialDescriptor,
    PlatformWebAuthnEnrollmentResult,
    PlatformWebAuthnRegistrationCredential,
    PlatformWebAuthnRegistrationOptions,
    VerifiedPlatformWebAuthnAuthentication,
    VerifiedPlatformWebAuthnRegistration,
)


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


class PlatformWebAuthnVerifier(Protocol):
    """Audited WebAuthn implementation boundary; success means every supplied expectation was verified."""

    def verify_registration(
        self,
        *,
        credential: PlatformWebAuthnRegistrationCredential,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        allowed_cose_algorithms: tuple[int, ...],
        require_user_verification: bool,
    ) -> VerifiedPlatformWebAuthnRegistration: ...

    def verify_authentication(
        self,
        *,
        credential: PlatformWebAuthnAuthenticationCredential,
        credential_public_key: str,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        credential_current_sign_count: int,
        require_user_verification: bool,
    ) -> VerifiedPlatformWebAuthnAuthentication: ...


class PyWebAuthnVerifier:
    """Strict adapter around the repository-pinned py_webauthn implementation."""

    def verify_registration(
        self,
        *,
        credential: PlatformWebAuthnRegistrationCredential,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        allowed_cose_algorithms: tuple[int, ...],
        require_user_verification: bool,
    ) -> VerifiedPlatformWebAuthnRegistration:
        try:
            expected_challenge = self._expected_challenge(
                client_data_json=credential.response.client_data_json,
                expected_challenge_hash=expected_challenge_hash,
            )
            verified = verify_registration_response(
                credential=credential.model_dump(by_alias=True, mode="json"),
                expected_challenge=expected_challenge,
                expected_rp_id=expected_rp_id,
                expected_origin=expected_origin,
                require_user_verification=require_user_verification,
                supported_pub_key_algs=[COSEAlgorithmIdentifier(value) for value in allowed_cose_algorithms],
            )
        except (TypeError, ValueError, WebAuthnException) as exc:
            raise BadRequest(error="PLATFORM_WEBAUTHN_REGISTRATION_INVALID") from exc
        return VerifiedPlatformWebAuthnRegistration(
            credential_id=bytes_to_base64url(verified.credential_id),
            credential_public_key=bytes_to_base64url(verified.credential_public_key),
            sign_count=verified.sign_count,
            user_verified=verified.user_verified,
        )

    def verify_authentication(
        self,
        *,
        credential: PlatformWebAuthnAuthenticationCredential,
        credential_public_key: str,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        credential_current_sign_count: int,
        require_user_verification: bool,
    ) -> VerifiedPlatformWebAuthnAuthentication:
        try:
            expected_challenge = self._expected_challenge(
                client_data_json=credential.response.client_data_json,
                expected_challenge_hash=expected_challenge_hash,
            )
            verified = verify_authentication_response(
                credential=credential.model_dump(by_alias=True, mode="json"),
                expected_challenge=expected_challenge,
                expected_rp_id=expected_rp_id,
                expected_origin=expected_origin,
                credential_public_key=base64url_to_bytes(credential_public_key),
                credential_current_sign_count=credential_current_sign_count,
                require_user_verification=require_user_verification,
            )
        except (TypeError, ValueError, WebAuthnException) as exc:
            raise BadRequest(error="PLATFORM_WEBAUTHN_AUTHENTICATION_INVALID") from exc
        return VerifiedPlatformWebAuthnAuthentication(
            credential_id=bytes_to_base64url(verified.credential_id),
            sign_count=verified.new_sign_count,
            user_verified=verified.user_verified,
        )

    @staticmethod
    def _expected_challenge(*, client_data_json: str, expected_challenge_hash: str) -> bytes:
        client_data = parse_client_data_json(base64url_to_bytes(client_data_json))
        if not hmac.compare_digest(_digest(bytes_to_base64url(client_data.challenge)), expected_challenge_hash):
            raise ValueError("WebAuthn challenge does not match the durable ceremony")
        return client_data.challenge


class PlatformWebAuthnPersistence(Protocol):
    def transaction(self) -> AbstractAsyncContextManager[BaseDBAsyncClient]: ...

    async def create_challenge(self, *, values: dict[str, object]) -> PlatformWebAuthnChallenge: ...

    async def consume_challenge(
        self,
        *,
        challenge_id: UUID,
        user_id: UUID,
        purpose: PlatformWebAuthnChallengePurpose,
        consumed_at: datetime,
    ) -> PlatformWebAuthnChallenge | None: ...

    async def list_verified_methods(self, *, user_id: UUID) -> Sequence[PlatformMfaMethod]: ...

    async def create_verified_method(
        self, *, values: dict[str, object], conn: BaseDBAsyncClient
    ) -> PlatformMfaMethod: ...

    async def get_verified_method(self, *, user_id: UUID, credential_id: str) -> PlatformMfaMethod | None: ...

    async def try_advance_sign_count(
        self,
        *,
        method_id: UUID,
        expected_count: int,
        new_count: int,
        used_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> bool: ...

    async def touch_counterless_method(
        self, *, method_id: UUID, used_at: datetime, conn: BaseDBAsyncClient
    ) -> bool: ...

    async def get_management_enrollment_replay(
        self,
        *,
        user_id: UUID,
        action: str,
        idempotency_key: str,
        correlation_id: UUID,
        request_fingerprint: str,
    ) -> UUID | None: ...

    async def commit_management_registration(
        self,
        *,
        values: dict[str, object],
        user_id: UUID,
        replaced_method_id: UUID | None,
        action: str,
        idempotency_key: str,
        correlation_id: UUID,
        request_fingerprint: str,
        occurred_at: datetime,
    ) -> PlatformMfaMethod: ...


class PlatformOperatorSetupCompletion(Protocol):
    async def complete_operator_setup(
        self,
        *,
        user_id: UUID,
        operator_id: UUID,
        invitation_id: UUID | None,
        expected_invitation_revision: int | None,
        activation_correlation_id: UUID | None,
        activation_idempotency_key: str | None,
        conn: BaseDBAsyncClient,
    ) -> PlatformRecoveryCodeSet: ...


class TortoisePlatformWebAuthnPersistence:
    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[BaseDBAsyncClient]:
        async with in_transaction() as conn:
            yield conn

    async def create_challenge(self, *, values: dict[str, object]) -> PlatformWebAuthnChallenge:
        return await PlatformWebAuthnChallenge.create(**cast(Any, values))

    async def consume_challenge(
        self,
        *,
        challenge_id: UUID,
        user_id: UUID,
        purpose: PlatformWebAuthnChallengePurpose,
        consumed_at: datetime,
    ) -> PlatformWebAuthnChallenge | None:
        async with in_transaction() as conn:
            challenge = await (
                PlatformWebAuthnChallenge
                .filter(id=challenge_id, user_id=user_id, purpose=purpose)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if challenge is None or challenge.consumed_at is not None:
                return None
            challenge.consumed_at = consumed_at
            await challenge.save(update_fields=["consumed_at"], using_db=conn)
            return challenge

    async def list_verified_methods(self, *, user_id: UUID) -> list[PlatformMfaMethod]:
        return await PlatformMfaMethod.filter(
            user_id=user_id,
            kind=PlatformMfaMethodKind.WEBAUTHN,
            status=PlatformMfaMethodStatus.VERIFIED,
            revoked_at=None,
        ).order_by("verified_at", "id")

    async def create_verified_method(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> PlatformMfaMethod:
        return await PlatformMfaMethod.create(**values, using_db=conn)

    async def get_verified_method(self, *, user_id: UUID, credential_id: str) -> PlatformMfaMethod | None:
        return await PlatformMfaMethod.filter(
            user_id=user_id,
            credential_id=credential_id,
            kind=PlatformMfaMethodKind.WEBAUTHN,
            status=PlatformMfaMethodStatus.VERIFIED,
            revoked_at=None,
        ).first()

    async def try_advance_sign_count(
        self,
        *,
        method_id: UUID,
        expected_count: int,
        new_count: int,
        used_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> bool:
        updated = (
            await PlatformMfaMethod
            .filter(
                id=method_id,
                kind=PlatformMfaMethodKind.WEBAUTHN,
                status=PlatformMfaMethodStatus.VERIFIED,
                revoked_at=None,
                sign_count=expected_count,
            )
            .using_db(conn)
            .update(sign_count=new_count, last_used_at=used_at)
        )
        return updated == 1

    async def touch_counterless_method(self, *, method_id: UUID, used_at: datetime, conn: BaseDBAsyncClient) -> bool:
        updated = (
            await PlatformMfaMethod
            .filter(
                id=method_id,
                kind=PlatformMfaMethodKind.WEBAUTHN,
                status=PlatformMfaMethodStatus.VERIFIED,
                revoked_at=None,
                sign_count=0,
            )
            .using_db(conn)
            .update(last_used_at=used_at)
        )
        return updated == 1

    async def get_management_enrollment_replay(
        self,
        *,
        user_id: UUID,
        action: str,
        idempotency_key: str,
        correlation_id: UUID,
        request_fingerprint: str,
    ) -> UUID | None:
        receipt = await PlatformIdentityMutationReceipt.filter(
            actor_user_id=user_id, action=action, idempotency_key=idempotency_key
        ).first()
        if receipt is None:
            return None
        if receipt.request_fingerprint != request_fingerprint or UUID(str(receipt.correlation_id)) != correlation_id:
            raise Conflict(error="PLATFORM_IDEMPOTENCY_CONFLICT")
        return UUID(str(receipt.entity_id))

    async def commit_management_registration(
        self,
        *,
        values: dict[str, object],
        user_id: UUID,
        replaced_method_id: UUID | None,
        action: str,
        idempotency_key: str,
        correlation_id: UUID,
        request_fingerprint: str,
        occurred_at: datetime,
    ) -> PlatformMfaMethod:
        async with self.transaction() as conn:
            existing = (
                await PlatformIdentityMutationReceipt
                .filter(actor_user_id=user_id, action=action, idempotency_key=idempotency_key)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if existing is not None:
                if (
                    existing.request_fingerprint != request_fingerprint
                    or UUID(str(existing.correlation_id)) != correlation_id
                ):
                    raise Conflict(error="PLATFORM_IDEMPOTENCY_CONFLICT")
                method = await PlatformMfaMethod.filter(id=existing.entity_id).using_db(conn).first()
                if method is None:
                    raise Conflict(error="PLATFORM_IDEMPOTENCY_RESULT_MISSING")
                return method
            method = await self.create_verified_method(values=values, conn=conn)
            if replaced_method_id is not None:
                await PlatformMfaRepository().retire_verified_method_after_replacement(
                    user_id=user_id,
                    replaced_method_id=replaced_method_id,
                    replacement_method_id=UUID(str(method.id)),
                    revoked_at=occurred_at,
                    conn=conn,
                )
            await AuditEvent.create(
                using_db=conn,
                occurred_at=occurred_at,
                event_name="platform.mfa.method_replaced" if replaced_method_id else "platform.mfa.method_enrolled",
                actor_user_id=user_id,
                entity_type="platform_mfa_method",
                entity_id=method.id,
                source="platform",
                properties={"correlation_id": str(correlation_id), "idempotency_key": idempotency_key},
            )
            await PlatformIdentityMutationReceipt.create(
                using_db=conn,
                actor_user_id=user_id,
                action=action,
                idempotency_key=idempotency_key,
                request_fingerprint=request_fingerprint,
                entity_id=method.id,
                correlation_id=correlation_id,
            )
            return method


class PlatformWebAuthnService(BaseService):
    def __init__(
        self,
        *,
        repository: PlatformWebAuthnPersistence | None = None,
        verifier: PlatformWebAuthnVerifier | None = None,
        operator_setup_completion: PlatformOperatorSetupCompletion | None = None,
        settings: Settings | None = None,
        now: Callable[[], datetime] | None = None,
        challenge_factory: Callable[[], bytes] = lambda: token_bytes(32),
    ) -> None:
        super().__init__(settings)
        self._repository = repository or TortoisePlatformWebAuthnPersistence()
        self._verifier = verifier or PyWebAuthnVerifier()
        self._operator_setup_completion = operator_setup_completion
        self._settings = self.settings
        self._now = now or (lambda: datetime.now(UTC))
        self._challenge_factory = challenge_factory

    async def begin_registration(
        self, *, user_id: UUID, user_name: str, display_name: str, binding: str
    ) -> PlatformWebAuthnRegistrationOptions:
        config = self._require_config()
        challenge_bytes, challenge, expires_at = self._new_challenge(config.challenge_ttl_seconds)
        record = await self._repository.create_challenge(
            values=self._challenge_values(
                user_id=user_id,
                purpose=PlatformWebAuthnChallengePurpose.REGISTRATION,
                challenge=challenge,
                binding=binding,
                expires_at=expires_at,
            )
        )
        existing = await self._repository.list_verified_methods(user_id=user_id)
        generated = generate_registration_options(
            rp_id=config.rp_id,
            rp_name=config.rp_name,
            user_id=user_id.bytes,
            user_name=user_name,
            user_display_name=display_name,
            challenge=challenge_bytes,
            timeout=config.challenge_ttl_seconds * 1000,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED,
                require_resident_key=False,
                user_verification=UserVerificationRequirement.REQUIRED,
            ),
            exclude_credentials=[
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(cast(str, method.credential_id)))
                for method in existing
                if method.credential_id
            ],
            supported_pub_key_algs=[COSEAlgorithmIdentifier(value) for value in config.allowed_cose_algorithms],
        )
        return PlatformWebAuthnRegistrationOptions.model_validate({
            "challengeId": record.id,
            **json.loads(options_to_json(generated)),
        })

    async def complete_registration(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: PlatformWebAuthnRegistrationCredential,
        operator_id: UUID | None = None,
        invitation_id: UUID | None = None,
        expected_invitation_revision: int | None = None,
        activation_correlation_id: UUID | None = None,
        activation_idempotency_key: str | None = None,
    ) -> PlatformWebAuthnEnrollmentResult:
        config = self._require_config()
        challenge = await self._consume_and_validate_challenge(
            challenge_id=challenge_id,
            user_id=user_id,
            purpose=PlatformWebAuthnChallengePurpose.REGISTRATION,
            binding=binding,
        )
        verified = self._verifier.verify_registration(
            credential=credential,
            expected_challenge_hash=challenge.challenge_hash,
            expected_origin=config.origin,
            expected_rp_id=config.rp_id,
            allowed_cose_algorithms=config.allowed_cose_algorithms,
            require_user_verification=True,
        )
        self._require_verified_registration(verified=verified, credential=credential)
        now = self._now()
        try:
            async with self._repository.transaction() as conn:
                method = await self._repository.create_verified_method(
                    values={
                        "user_id": user_id,
                        "kind": PlatformMfaMethodKind.WEBAUTHN,
                        "status": PlatformMfaMethodStatus.VERIFIED,
                        "credential_id": verified.credential_id,
                        "credential_public_key": verified.credential_public_key,
                        "sign_count": verified.sign_count,
                        "relying_party_id": config.rp_id,
                        "verified_at": now,
                        "last_used_at": now,
                    },
                    conn=conn,
                )
                recovery_codes = None
                if operator_id is not None:
                    if self._operator_setup_completion is None:
                        raise ServiceUnavailable(error="PLATFORM_OPERATOR_SETUP_COMPLETION_UNAVAILABLE")
                    recovery_codes = await self._operator_setup_completion.complete_operator_setup(
                        user_id=user_id,
                        operator_id=operator_id,
                        invitation_id=invitation_id,
                        expected_invitation_revision=expected_invitation_revision,
                        activation_correlation_id=activation_correlation_id,
                        activation_idempotency_key=activation_idempotency_key,
                        conn=conn,
                    )
        except IntegrityError as exc:
            raise Conflict(error="PLATFORM_WEBAUTHN_CREDENTIAL_ALREADY_REGISTERED") from exc
        return PlatformWebAuthnEnrollmentResult(method_id=method.id, recovery_codes=recovery_codes)

    async def complete_management_registration(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: PlatformWebAuthnRegistrationCredential,
        replace_method_id: UUID | None,
        idempotency_key: str,
        correlation_id: UUID,
    ) -> PlatformWebAuthnEnrollmentResult:
        action = "replace_platform_webauthn_method" if replace_method_id else "add_platform_webauthn_method"
        fingerprint = _digest(
            json.dumps(
                {
                    "challenge_id": str(challenge_id),
                    "credential_id": credential.raw_id,
                    "replace_method_id": None if replace_method_id is None else str(replace_method_id),
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        replay = await self._repository.get_management_enrollment_replay(
            user_id=user_id,
            action=action,
            idempotency_key=idempotency_key,
            correlation_id=correlation_id,
            request_fingerprint=fingerprint,
        )
        if replay is not None:
            return PlatformWebAuthnEnrollmentResult(method_id=replay)
        config = self._require_config()
        challenge = await self._consume_and_validate_challenge(
            challenge_id=challenge_id,
            user_id=user_id,
            purpose=PlatformWebAuthnChallengePurpose.REGISTRATION,
            binding=binding,
        )
        verified = self._verifier.verify_registration(
            credential=credential,
            expected_challenge_hash=challenge.challenge_hash,
            expected_origin=config.origin,
            expected_rp_id=config.rp_id,
            allowed_cose_algorithms=config.allowed_cose_algorithms,
            require_user_verification=True,
        )
        self._require_verified_registration(verified=verified, credential=credential)
        now = self._now()
        try:
            method = await self._repository.commit_management_registration(
                values={
                    "user_id": user_id,
                    "kind": PlatformMfaMethodKind.WEBAUTHN,
                    "status": PlatformMfaMethodStatus.VERIFIED,
                    "credential_id": verified.credential_id,
                    "credential_public_key": verified.credential_public_key,
                    "sign_count": verified.sign_count,
                    "relying_party_id": config.rp_id,
                    "verified_at": now,
                    "last_used_at": now,
                },
                user_id=user_id,
                replaced_method_id=replace_method_id,
                action=action,
                idempotency_key=idempotency_key,
                correlation_id=correlation_id,
                request_fingerprint=fingerprint,
                occurred_at=now,
            )
        except IntegrityError as exc:
            raise Conflict(error="PLATFORM_WEBAUTHN_CREDENTIAL_ALREADY_REGISTERED") from exc
        return PlatformWebAuthnEnrollmentResult(method_id=method.id)

    async def begin_authentication(self, *, user_id: UUID, binding: str) -> PlatformWebAuthnAuthenticationOptions:
        config = self._require_config()
        methods = await self._repository.list_verified_methods(user_id=user_id)
        descriptors = tuple(
            PlatformWebAuthnCredentialDescriptor(id=cast(str, method.credential_id))
            for method in methods
            if method.credential_id and method.credential_public_key and method.relying_party_id == config.rp_id
        )
        if not descriptors:
            raise Conflict(error="PLATFORM_WEBAUTHN_METHOD_REQUIRED")
        challenge_bytes, challenge, expires_at = self._new_challenge(config.challenge_ttl_seconds)
        record = await self._repository.create_challenge(
            values=self._challenge_values(
                user_id=user_id,
                purpose=PlatformWebAuthnChallengePurpose.AUTHENTICATION,
                challenge=challenge,
                binding=binding,
                expires_at=expires_at,
            )
        )
        generated = generate_authentication_options(
            rp_id=config.rp_id,
            challenge=challenge_bytes,
            timeout=config.challenge_ttl_seconds * 1000,
            allow_credentials=[
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(descriptor.id)) for descriptor in descriptors
            ],
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        return PlatformWebAuthnAuthenticationOptions.model_validate({
            "challengeId": record.id,
            **json.loads(options_to_json(generated)),
        })

    async def complete_authentication(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: PlatformWebAuthnAuthenticationCredential,
    ) -> PlatformMfaVerification:
        config = self._require_config()
        challenge = await self._consume_and_validate_challenge(
            challenge_id=challenge_id,
            user_id=user_id,
            purpose=PlatformWebAuthnChallengePurpose.AUTHENTICATION,
            binding=binding,
        )
        method = await self._repository.get_verified_method(user_id=user_id, credential_id=credential.raw_id)
        if method is None or not method.credential_public_key or method.relying_party_id != config.rp_id:
            raise NotFound(error="PLATFORM_WEBAUTHN_METHOD_NOT_FOUND")
        verified = self._verifier.verify_authentication(
            credential=credential,
            credential_public_key=cast(str, method.credential_public_key),
            expected_challenge_hash=challenge.challenge_hash,
            expected_origin=config.origin,
            expected_rp_id=config.rp_id,
            credential_current_sign_count=cast(int, method.sign_count),
            require_user_verification=True,
        )
        self._require_verified_authentication(verified=verified, credential=credential)
        await self._record_authentication(method=method, new_count=verified.sign_count)
        return PlatformMfaVerification(method_id=method.id, assurance=PlatformMfaAssurance.PHISHING_RESISTANT)

    def _require_config(self):
        config = self._settings.platform_auth.webauthn
        if config.rp_id is None or config.origin is None:
            raise ServiceUnavailable(error="PLATFORM_WEBAUTHN_NOT_CONFIGURED")
        return config

    def _new_challenge(self, ttl_seconds: int) -> tuple[bytes, str, datetime]:
        challenge_bytes = self._challenge_factory()
        if len(challenge_bytes) < 32:
            raise ServiceUnavailable(error="PLATFORM_WEBAUTHN_CHALLENGE_FACTORY_INVALID")
        return challenge_bytes, bytes_to_base64url(challenge_bytes), self._now() + timedelta(seconds=ttl_seconds)

    def _challenge_values(
        self,
        *,
        user_id: UUID,
        purpose: PlatformWebAuthnChallengePurpose,
        challenge: str,
        binding: str,
        expires_at: datetime,
    ) -> dict[str, object]:
        config = self._require_config()
        if not binding.strip():
            raise BadRequest(error="PLATFORM_WEBAUTHN_BINDING_REQUIRED")
        return {
            "user_id": user_id,
            "purpose": purpose,
            "challenge_hash": _digest(challenge),
            "binding_hash": _digest(binding),
            "relying_party_id": config.rp_id,
            "origin": config.origin,
            "expires_at": expires_at,
        }

    async def _consume_and_validate_challenge(
        self,
        *,
        challenge_id: UUID,
        user_id: UUID,
        purpose: PlatformWebAuthnChallengePurpose,
        binding: str,
    ) -> PlatformWebAuthnChallenge:
        challenge = await self._repository.consume_challenge(
            challenge_id=challenge_id,
            user_id=user_id,
            purpose=purpose,
            consumed_at=self._now(),
        )
        if challenge is None:
            raise Conflict(error="PLATFORM_WEBAUTHN_CHALLENGE_USED_OR_INVALID")
        config = self._require_config()
        if challenge.expires_at <= self._now():
            raise Conflict(error="PLATFORM_WEBAUTHN_CHALLENGE_EXPIRED")
        if challenge.relying_party_id != config.rp_id or challenge.origin != config.origin:
            raise Conflict(error="PLATFORM_WEBAUTHN_RELYING_PARTY_CHANGED")
        if not hmac.compare_digest(challenge.binding_hash, _digest(binding)):
            raise Conflict(error="PLATFORM_WEBAUTHN_BINDING_CHANGED")
        return challenge

    @staticmethod
    def _require_verified_registration(
        *, verified: VerifiedPlatformWebAuthnRegistration, credential: PlatformWebAuthnRegistrationCredential
    ) -> None:
        if not verified.user_verified:
            raise BadRequest(error="PLATFORM_WEBAUTHN_USER_VERIFICATION_REQUIRED")
        if verified.sign_count < 0 or not verified.credential_public_key or len(verified.credential_id) > 1024:
            raise BadRequest(error="PLATFORM_WEBAUTHN_REGISTRATION_INVALID")
        if not hmac.compare_digest(verified.credential_id, credential.raw_id) or not hmac.compare_digest(
            credential.id, credential.raw_id
        ):
            raise BadRequest(error="PLATFORM_WEBAUTHN_CREDENTIAL_ID_MISMATCH")

    @staticmethod
    def _require_verified_authentication(
        *, verified: VerifiedPlatformWebAuthnAuthentication, credential: PlatformWebAuthnAuthenticationCredential
    ) -> None:
        if not verified.user_verified:
            raise BadRequest(error="PLATFORM_WEBAUTHN_USER_VERIFICATION_REQUIRED")
        if verified.sign_count < 0:
            raise BadRequest(error="PLATFORM_WEBAUTHN_AUTHENTICATION_INVALID")
        if not hmac.compare_digest(verified.credential_id, credential.raw_id) or not hmac.compare_digest(
            credential.id, credential.raw_id
        ):
            raise BadRequest(error="PLATFORM_WEBAUTHN_CREDENTIAL_ID_MISMATCH")

    async def _record_authentication(self, *, method: PlatformMfaMethod, new_count: int) -> None:
        stored_count = cast(int | None, method.sign_count)
        if stored_count is None:
            raise Conflict(error="PLATFORM_WEBAUTHN_COUNTER_STATE_INVALID")
        now = self._now()
        async with self._repository.transaction() as conn:
            if stored_count == 0 and new_count == 0:
                updated = await self._repository.touch_counterless_method(method_id=method.id, used_at=now, conn=conn)
            elif new_count <= stored_count:
                raise Conflict(error="PLATFORM_WEBAUTHN_SIGNATURE_COUNTER_REPLAY")
            else:
                updated = await self._repository.try_advance_sign_count(
                    method_id=method.id,
                    expected_count=stored_count,
                    new_count=new_count,
                    used_at=now,
                    conn=conn,
                )
            if not updated:
                raise Conflict(error="PLATFORM_WEBAUTHN_SIGNATURE_COUNTER_REPLAY")


class PlatformAuthFlowChallengeRepository(TortoiseORMRepository):
    """Durable single-use setup/login-MFA authority following primary identity authentication."""

    def __init__(
        self,
        *,
        ttl_seconds: int,
        now: Callable[[], datetime] | None = None,
        token_factory: Callable[[], str] = lambda: token_urlsafe(32),
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("Platform auth flow ttl_seconds must be positive")
        self._ttl_seconds = ttl_seconds
        self._now = now or (lambda: datetime.now(UTC))
        self._token_factory = token_factory

    async def issue(
        self,
        *,
        user_id: UUID,
        purpose: PlatformAuthFlowPurpose,
        identity_revision: int,
        setup_context: PlatformInvitationSetupContext | None = None,
    ) -> PlatformAuthFlowIssued:
        if identity_revision < 0:
            raise ValueError("identity_revision must not be negative")
        token = self._token_factory()
        if len(token) < 32:
            raise ServiceUnavailable(error="PLATFORM_AUTH_FLOW_TOKEN_FACTORY_INVALID")
        expires_at = self._now() + timedelta(seconds=self._ttl_seconds)
        record = await PlatformAuthFlowChallenge.create(
            user_id=user_id,
            purpose=purpose,
            token_hash=_digest(token),
            identity_revision=identity_revision,
            invitation_id=None if setup_context is None else setup_context.invitation_id,
            invitation_revision=None if setup_context is None else setup_context.invitation_revision,
            requires_phishing_resistant=(
                False if setup_context is None else setup_context.requires_phishing_resistant
            ),
            expires_at=expires_at,
        )
        return PlatformAuthFlowIssued(flow_id=record.id, token=token, expires_at=expires_at)

    async def require(self, *, token: str, purpose: PlatformAuthFlowPurpose) -> PlatformAuthFlowRecord:
        record = await PlatformAuthFlowChallenge.filter(token_hash=_digest(token), purpose=purpose).first()
        return self._require_active(record)

    async def record_failure(self, *, flow_id: UUID) -> PlatformAuthFlowRecord:
        async with in_transaction() as conn:
            record = await PlatformAuthFlowChallenge.filter(id=flow_id).using_db(conn).select_for_update().first()
            active = self._require_active(record)
            now = self._now()
            await (
                PlatformAuthFlowChallenge
                .filter(id=flow_id, consumed_at=None)
                .using_db(conn)
                .update(
                    failure_count=F("failure_count") + 1,
                    last_failure_at=now,
                )
            )
            return active.model_copy(update={"failure_count": active.failure_count + 1})

    async def consume(self, *, flow_id: UUID) -> PlatformAuthFlowRecord:
        async with in_transaction() as conn:
            record = await PlatformAuthFlowChallenge.filter(id=flow_id).using_db(conn).select_for_update().first()
            active = self._require_active(record)
            updated = (
                await PlatformAuthFlowChallenge
                .filter(id=flow_id, consumed_at=None)
                .using_db(conn)
                .update(consumed_at=self._now())
            )
            if updated != 1:
                raise Conflict(error="PLATFORM_AUTH_FLOW_CONSUMED")
            return active

    def _require_active(self, record: PlatformAuthFlowChallenge | None) -> PlatformAuthFlowRecord:
        if record is None:
            raise Unauthorized(error="PLATFORM_AUTH_FLOW_INVALID")
        if record.consumed_at is not None:
            raise Conflict(error="PLATFORM_AUTH_FLOW_CONSUMED")
        if record.expires_at <= self._now():
            raise Conflict(error="PLATFORM_AUTH_FLOW_EXPIRED")
        return PlatformAuthFlowRecord(
            flow_id=record.id,
            user_id=UUID(str(record.user_id)),
            purpose=record.purpose,
            identity_revision=record.identity_revision,
            invitation_id=None if record.invitation_id is None else UUID(str(record.invitation_id)),
            invitation_revision=record.invitation_revision,
            requires_phishing_resistant=record.requires_phishing_resistant,
            expires_at=record.expires_at,
            failure_count=record.failure_count,
        )
