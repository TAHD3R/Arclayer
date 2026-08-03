from __future__ import annotations

import hmac
import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_bytes
from typing import Protocol, cast
from uuid import UUID

from tortoise.exceptions import IntegrityError
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

from src.common.constants.auth import REAUTH_MAX_AGE_SECONDS
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable, Unauthorized
from src.core.services import BaseService
from src.models.auth.user_webauthn import (
    UserWebAuthnChallenge,
    UserWebAuthnChallengePurpose,
    UserWebAuthnCredential,
)
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import verify_password
from src.modules.auth.webauthn.schema import (
    VerifiedWebAuthnAuthentication,
    VerifiedWebAuthnRegistration,
    WebAuthnAuthenticationCredential,
    WebAuthnAuthenticationOptions,
    WebAuthnCredentialListOut,
    WebAuthnCredentialOut,
    WebAuthnRegistrationCredential,
    WebAuthnRegistrationOptions,
)


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


class WebAuthnVerifier(Protocol):
    def verify_registration(
        self,
        *,
        credential: WebAuthnRegistrationCredential,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        allowed_cose_algorithms: tuple[int, ...],
    ) -> VerifiedWebAuthnRegistration: ...

    def verify_authentication(
        self,
        *,
        credential: WebAuthnAuthenticationCredential,
        credential_public_key: str,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        credential_current_sign_count: int,
    ) -> VerifiedWebAuthnAuthentication: ...


class PyWebAuthnVerifier:
    def verify_registration(
        self,
        *,
        credential: WebAuthnRegistrationCredential,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        allowed_cose_algorithms: tuple[int, ...],
    ) -> VerifiedWebAuthnRegistration:
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
                require_user_verification=True,
                supported_pub_key_algs=[COSEAlgorithmIdentifier(value) for value in allowed_cose_algorithms],
            )
        except (TypeError, ValueError, WebAuthnException) as exc:
            raise BadRequest(error="WEBAUTHN_REGISTRATION_INVALID") from exc
        return VerifiedWebAuthnRegistration(
            credential_id=bytes_to_base64url(verified.credential_id),
            credential_public_key=bytes_to_base64url(verified.credential_public_key),
            sign_count=verified.sign_count,
            user_verified=verified.user_verified,
        )

    def verify_authentication(
        self,
        *,
        credential: WebAuthnAuthenticationCredential,
        credential_public_key: str,
        expected_challenge_hash: str,
        expected_origin: str,
        expected_rp_id: str,
        credential_current_sign_count: int,
    ) -> VerifiedWebAuthnAuthentication:
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
                require_user_verification=True,
            )
        except (TypeError, ValueError, WebAuthnException) as exc:
            raise BadRequest(error="WEBAUTHN_AUTHENTICATION_INVALID") from exc
        return VerifiedWebAuthnAuthentication(
            credential_id=bytes_to_base64url(verified.credential_id),
            sign_count=verified.new_sign_count,
            user_verified=verified.user_verified,
        )

    @staticmethod
    def _expected_challenge(*, client_data_json: str, expected_challenge_hash: str) -> bytes:
        client_data = parse_client_data_json(base64url_to_bytes(client_data_json))
        if not hmac.compare_digest(
            _digest(bytes_to_base64url(client_data.challenge)),
            expected_challenge_hash,
        ):
            raise ValueError("WebAuthn challenge does not match the durable ceremony")
        return client_data.challenge


class AuthWebAuthnService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        verifier: WebAuthnVerifier | None = None,
        now: Callable[[], datetime] | None = None,
        challenge_factory: Callable[[], bytes] = lambda: token_bytes(32),
    ) -> None:
        super().__init__(settings)
        self._verifier = verifier or PyWebAuthnVerifier()
        self._now = now or (lambda: datetime.now(UTC))
        self._challenge_factory = challenge_factory
        self._user_repo = UserRepository()

    async def list_credentials(self, *, user_id: UUID) -> WebAuthnCredentialListOut:
        rows = await UserWebAuthnCredential.filter(user_id=user_id).order_by("created_at", "id")
        return WebAuthnCredentialListOut(
            items=[
                WebAuthnCredentialOut(
                    id=row.id,
                    label=row.label,
                    created_at=row.created_at,
                    last_used_at=row.last_used_at,
                )
                for row in rows
            ]
        )

    async def is_enabled(self, *, user_id: UUID) -> bool:
        return await UserWebAuthnCredential.filter(user_id=user_id).exists()

    async def ensure_registration_reauth(self, *, user_id: UUID, password: str | None) -> None:
        user = await self._user_repo.get_by_id_with_credential(user_id)
        if user is None:
            raise Unauthorized(error="USER_NOT_FOUND")
        credential = getattr(user, "credential", None)
        if credential is not None:
            normalized = (password or "").strip()
            if not normalized:
                raise Unauthorized(error="REAUTH_REQUIRED", meta={"methods": ["password"]})
            password_hash = cast(str, getattr(credential, "password_hash", ""))
            if not verify_password(normalized, password_hash, self.settings.auth):
                raise Unauthorized(error="INVALID_CREDENTIALS")
            return
        last_login_at = cast(datetime | None, getattr(user, "last_login_at", None))
        if last_login_at is None:
            raise Unauthorized(error="REAUTH_REQUIRED", meta={"methods": ["relogin"]})
        if (self._now() - last_login_at.astimezone(UTC)).total_seconds() > REAUTH_MAX_AGE_SECONDS:
            raise Unauthorized(error="REAUTH_REQUIRED", meta={"methods": ["relogin"]})

    async def begin_registration(
        self,
        *,
        user_id: UUID,
        user_name: str,
        display_name: str,
        binding: str,
    ) -> WebAuthnRegistrationOptions:
        config = self._require_config()
        challenge_bytes, challenge, expires_at = self._new_challenge()
        record = await UserWebAuthnChallenge.create(
            user_id=user_id,
            purpose=UserWebAuthnChallengePurpose.REGISTRATION,
            challenge_hash=_digest(challenge),
            binding_hash=_digest(self._require_binding(binding)),
            relying_party_id=config.rp_id,
            origin=config.origin,
            expires_at=expires_at,
        )
        existing = await UserWebAuthnCredential.filter(user_id=user_id)
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
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(item.credential_id)) for item in existing
            ],
            supported_pub_key_algs=[COSEAlgorithmIdentifier(value) for value in config.allowed_cose_algorithms],
        )
        return WebAuthnRegistrationOptions.model_validate({
            "challengeId": record.id,
            **json.loads(options_to_json(generated)),
        })

    async def complete_registration(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: WebAuthnRegistrationCredential,
        label: str | None,
    ) -> WebAuthnCredentialOut:
        config = self._require_config()
        challenge = await self._consume_challenge(
            challenge_id=challenge_id,
            user_id=user_id,
            purpose=UserWebAuthnChallengePurpose.REGISTRATION,
            binding=binding,
        )
        verified = self._verifier.verify_registration(
            credential=credential,
            expected_challenge_hash=challenge.challenge_hash,
            expected_origin=config.origin,
            expected_rp_id=config.rp_id,
            allowed_cose_algorithms=config.allowed_cose_algorithms,
        )
        self._require_verified_registration(verified, credential)
        now = self._now()
        try:
            row = await UserWebAuthnCredential.create(
                user_id=user_id,
                label=(label or "").strip() or None,
                credential_id=verified.credential_id,
                credential_public_key=verified.credential_public_key,
                sign_count=verified.sign_count,
                relying_party_id=config.rp_id,
                last_used_at=now,
            )
        except IntegrityError as exc:
            raise Conflict(error="WEBAUTHN_CREDENTIAL_ALREADY_REGISTERED") from exc
        return WebAuthnCredentialOut(
            id=row.id,
            label=row.label,
            created_at=row.created_at,
            last_used_at=row.last_used_at,
        )

    async def begin_authentication(self, *, user_id: UUID, binding: str) -> WebAuthnAuthenticationOptions:
        config = self._require_config()
        credentials = await UserWebAuthnCredential.filter(
            user_id=user_id,
            relying_party_id=config.rp_id,
        ).order_by("created_at", "id")
        if not credentials:
            raise Conflict(error="WEBAUTHN_CREDENTIAL_REQUIRED")
        challenge_bytes, challenge, expires_at = self._new_challenge()
        record = await UserWebAuthnChallenge.create(
            user_id=user_id,
            purpose=UserWebAuthnChallengePurpose.AUTHENTICATION,
            challenge_hash=_digest(challenge),
            binding_hash=_digest(self._require_binding(binding)),
            relying_party_id=config.rp_id,
            origin=config.origin,
            expires_at=expires_at,
        )
        generated = generate_authentication_options(
            rp_id=config.rp_id,
            challenge=challenge_bytes,
            timeout=config.challenge_ttl_seconds * 1000,
            allow_credentials=[
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(item.credential_id)) for item in credentials
            ],
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        return WebAuthnAuthenticationOptions.model_validate({
            "challengeId": record.id,
            **json.loads(options_to_json(generated)),
        })

    async def complete_authentication(
        self,
        *,
        user_id: UUID,
        challenge_id: UUID,
        binding: str,
        credential: WebAuthnAuthenticationCredential,
    ) -> UUID:
        config = self._require_config()
        challenge = await self._consume_challenge(
            challenge_id=challenge_id,
            user_id=user_id,
            purpose=UserWebAuthnChallengePurpose.AUTHENTICATION,
            binding=binding,
        )
        row = await UserWebAuthnCredential.filter(
            user_id=user_id,
            credential_id=credential.raw_id,
        ).first()
        if row is None or row.relying_party_id != config.rp_id:
            raise NotFound(error="WEBAUTHN_CREDENTIAL_NOT_FOUND")
        verified = self._verifier.verify_authentication(
            credential=credential,
            credential_public_key=row.credential_public_key,
            expected_challenge_hash=challenge.challenge_hash,
            expected_origin=config.origin,
            expected_rp_id=config.rp_id,
            credential_current_sign_count=row.sign_count,
        )
        self._require_verified_authentication(verified, credential)
        await self._record_authentication(row=row, new_count=verified.sign_count)
        return row.id

    async def delete_credential(self, *, user_id: UUID, credential_id: UUID) -> None:
        deleted = await UserWebAuthnCredential.filter(id=credential_id, user_id=user_id).delete()
        if deleted != 1:
            raise NotFound(error="WEBAUTHN_CREDENTIAL_NOT_FOUND")

    def _require_config(self):
        config = self.settings.auth.webauthn
        if config.rp_id is None or config.origin is None:
            raise ServiceUnavailable(error="WEBAUTHN_NOT_CONFIGURED")
        return config

    def _new_challenge(self) -> tuple[bytes, str, datetime]:
        config = self._require_config()
        challenge_bytes = self._challenge_factory()
        if len(challenge_bytes) < 32:
            raise ServiceUnavailable(error="WEBAUTHN_CHALLENGE_FACTORY_INVALID")
        return (
            challenge_bytes,
            bytes_to_base64url(challenge_bytes),
            self._now() + timedelta(seconds=config.challenge_ttl_seconds),
        )

    @staticmethod
    def _require_binding(binding: str) -> str:
        normalized = binding.strip()
        if not normalized:
            raise BadRequest(error="WEBAUTHN_BINDING_REQUIRED")
        return normalized

    async def _consume_challenge(
        self,
        *,
        challenge_id: UUID,
        user_id: UUID,
        purpose: UserWebAuthnChallengePurpose,
        binding: str,
    ) -> UserWebAuthnChallenge:
        async with in_transaction() as conn:
            challenge = await (
                UserWebAuthnChallenge
                .filter(id=challenge_id, user_id=user_id, purpose=purpose)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if challenge is None or challenge.consumed_at is not None:
                raise Conflict(error="WEBAUTHN_CHALLENGE_USED_OR_INVALID")
            challenge.consumed_at = self._now()
            await challenge.save(update_fields=["consumed_at"], using_db=conn)
        config = self._require_config()
        if challenge.expires_at <= self._now():
            raise Conflict(error="WEBAUTHN_CHALLENGE_EXPIRED")
        if challenge.relying_party_id != config.rp_id or challenge.origin != config.origin:
            raise Conflict(error="WEBAUTHN_RELYING_PARTY_CHANGED")
        if not hmac.compare_digest(challenge.binding_hash, _digest(self._require_binding(binding))):
            raise Conflict(error="WEBAUTHN_BINDING_CHANGED")
        return challenge

    @staticmethod
    def _require_verified_registration(
        verified: VerifiedWebAuthnRegistration,
        credential: WebAuthnRegistrationCredential,
    ) -> None:
        if not verified.user_verified or verified.sign_count < 0 or not verified.credential_public_key:
            raise BadRequest(error="WEBAUTHN_REGISTRATION_INVALID")
        if len(verified.credential_id) > 1024:
            raise BadRequest(error="WEBAUTHN_REGISTRATION_INVALID")
        if not hmac.compare_digest(verified.credential_id, credential.raw_id) or not hmac.compare_digest(
            credential.id,
            credential.raw_id,
        ):
            raise BadRequest(error="WEBAUTHN_CREDENTIAL_ID_MISMATCH")

    @staticmethod
    def _require_verified_authentication(
        verified: VerifiedWebAuthnAuthentication,
        credential: WebAuthnAuthenticationCredential,
    ) -> None:
        if not verified.user_verified or verified.sign_count < 0:
            raise BadRequest(error="WEBAUTHN_AUTHENTICATION_INVALID")
        if not hmac.compare_digest(verified.credential_id, credential.raw_id) or not hmac.compare_digest(
            credential.id,
            credential.raw_id,
        ):
            raise BadRequest(error="WEBAUTHN_CREDENTIAL_ID_MISMATCH")

    async def _record_authentication(self, *, row: UserWebAuthnCredential, new_count: int) -> None:
        stored_count = row.sign_count
        now = self._now()
        if stored_count == 0 and new_count == 0:
            updated = await UserWebAuthnCredential.filter(id=row.id, sign_count=0).update(last_used_at=now)
        elif new_count <= stored_count:
            raise Conflict(error="WEBAUTHN_SIGNATURE_COUNTER_REPLAY")
        else:
            updated = await UserWebAuthnCredential.filter(id=row.id, sign_count=stored_count).update(
                sign_count=new_count,
                last_used_at=now,
            )
        if updated != 1:
            raise Conflict(error="WEBAUTHN_SIGNATURE_COUNTER_REPLAY")
