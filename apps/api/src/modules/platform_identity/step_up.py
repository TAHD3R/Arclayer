from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, Forbidden, Unauthorized
from src.core.services import BaseService
from src.models.platform_identity.operations import (
    PlatformActionPolicy,
    PlatformSession,
    PlatformStepUpProof,
    PlatformStepUpProofStatus,
    PlatformVerificationAssurance,
)
from src.modules.platform_identity.step_up_schema import (
    PlatformStepUpConsumeResult,
    PlatformStepUpProofConsumeRequest,
    PlatformStepUpProofIssueRequest,
    PlatformStepUpProofIssueResult,
)


class PlatformStepUpPersistence(Protocol):
    """Persistence boundary implemented by PlatformIdentityRepository."""

    def transaction(self) -> AbstractAsyncContextManager[BaseDBAsyncClient]: ...

    async def get_action_policy(
        self, *, action_code: str, conn: BaseDBAsyncClient, for_update: bool = False
    ) -> PlatformActionPolicy | None: ...

    async def get_platform_session(
        self, *, session_id: UUID, conn: BaseDBAsyncClient, for_update: bool = False
    ) -> PlatformSession | None: ...

    async def actor_has_permission(
        self, *, actor_user_id: UUID, permission_code: str, at: datetime, conn: BaseDBAsyncClient
    ) -> bool: ...

    async def create_step_up_proof(
        self, *, values: dict[str, object], conn: BaseDBAsyncClient
    ) -> PlatformStepUpProof: ...

    async def get_step_up_proof_by_hash(
        self, *, proof_hash: str, conn: BaseDBAsyncClient, for_update: bool = False
    ) -> PlatformStepUpProof | None: ...

    async def mark_step_up_proof_consumed(
        self, *, proof: PlatformStepUpProof, consumed_at: datetime, conn: BaseDBAsyncClient
    ) -> None: ...


class PlatformStepUpService(BaseService):
    """Issues and consumes action-bound proofs without granting standing authority."""

    def __init__(
        self,
        *,
        repository: PlatformStepUpPersistence,
        settings: Settings | None = None,
        now: Callable[[], datetime] | None = None,
        proof_factory: Callable[[], str] = lambda: token_urlsafe(32),
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._now = now or (lambda: datetime.now(UTC))
        self._proof_factory = proof_factory

    async def issue(
        self,
        *,
        request: PlatformStepUpProofIssueRequest,
        verified_assurance: PlatformVerificationAssurance,
    ) -> PlatformStepUpProofIssueResult:
        """Persist one hashed proof after the Platform MFA flow verified assurance."""

        now = self._now()
        async with self._repository.transaction() as conn:
            policy = await self._require_policy(action_code=request.action_code, conn=conn)
            session = await self._require_session(session_id=request.session_id, conn=conn)
            self._require_session_actor(session=session, actor_user_id=request.actor_user_id)
            await self._require_permission(request=request, policy=policy, now=now, conn=conn)
            self._require_assurance(required=policy.required_assurance, verified=verified_assurance)
            expires_at = self._expires_at(policy=policy, now=now)
            proof = self._proof_factory()
            record = await self._repository.create_step_up_proof(
                values={
                    "session_id": request.session_id,
                    "actor_user_id": request.actor_user_id,
                    "action_policy_id": policy.id,
                    "proof_hash": _proof_hash(proof),
                    "assurance": verified_assurance,
                    "target_type": request.target_type,
                    "target_id": request.target_id,
                    "scope": request.scope,
                    "expected_revision": request.expected_revision,
                    "preview_revision": request.preview_revision,
                    "policy_revision": policy.policy_revision,
                    "idempotency_key": request.idempotency_key,
                    "expires_at": expires_at,
                    "status": PlatformStepUpProofStatus.ACTIVE,
                },
                conn=conn,
            )
        return PlatformStepUpProofIssueResult(
            proof_id=record.id,
            proof=proof,
            assurance=verified_assurance,
            policy_revision=policy.policy_revision,
            expires_at=expires_at,
        )

    async def consume(self, *, request: PlatformStepUpProofConsumeRequest) -> PlatformStepUpConsumeResult:
        """Atomically consume an unchanged proof or return its same-idempotency receipt."""

        now = self._now()
        async with self._repository.transaction() as conn:
            proof = await self._repository.get_step_up_proof_by_hash(
                proof_hash=_proof_hash(request.proof), conn=conn, for_update=True
            )
            if proof is None:
                raise Unauthorized(error="PLATFORM_STEP_UP_PROOF_INVALID")
            policy = await self._require_policy(action_code=request.action_code, conn=conn)
            self._require_proof_context(proof=proof, request=request, policy=policy)
            if proof.status == PlatformStepUpProofStatus.CONSUMED:
                return PlatformStepUpConsumeResult(proof_id=proof.id)
            self._require_active_proof(proof=proof, now=now)
            session = await self._require_session(session_id=request.session_id, conn=conn)
            self._require_session_actor(session=session, actor_user_id=request.actor_user_id)
            await self._require_permission(request=request, policy=policy, now=now, conn=conn)
            self._require_assurance(required=policy.required_assurance, verified=proof.assurance)
            await self._repository.mark_step_up_proof_consumed(proof=proof, consumed_at=now, conn=conn)
            return PlatformStepUpConsumeResult(proof_id=proof.id)

    async def _require_policy(self, *, action_code: str, conn: BaseDBAsyncClient) -> PlatformActionPolicy:
        policy = await self._repository.get_action_policy(action_code=action_code, conn=conn, for_update=True)
        if policy is None or not policy.is_active:
            raise Conflict(error="PLATFORM_STEP_UP_POLICY_UNAVAILABLE")
        if not policy.requires_step_up:
            raise Conflict(error="PLATFORM_STEP_UP_NOT_REQUIRED")
        return policy

    async def _require_session(self, *, session_id: UUID, conn: BaseDBAsyncClient) -> PlatformSession:
        session = await self._repository.get_platform_session(session_id=session_id, conn=conn, for_update=True)
        if session is None or session.revoked_at is not None:
            raise Unauthorized(error="PLATFORM_SESSION_REVOKED")
        now = self._now()
        if session.inactivity_expires_at <= now or session.absolute_expires_at <= now:
            raise Unauthorized(error="PLATFORM_SESSION_EXPIRED")
        return session

    async def _require_permission(
        self,
        *,
        request: PlatformStepUpProofIssueRequest,
        policy: PlatformActionPolicy,
        now: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        if not await self._repository.actor_has_permission(
            actor_user_id=request.actor_user_id,
            permission_code=policy.permission.code,
            at=now,
            conn=conn,
        ):
            raise Forbidden(error="PLATFORM_PERMISSION_DENIED")

    @staticmethod
    def _require_session_actor(*, session: PlatformSession, actor_user_id: UUID) -> None:
        if UUID(str(session.actor_user_id)) != actor_user_id:
            raise Forbidden(error="PLATFORM_STEP_UP_ACTOR_MISMATCH")

    @staticmethod
    def _require_assurance(*, required: PlatformVerificationAssurance, verified: PlatformVerificationAssurance) -> None:
        if required == PlatformVerificationAssurance.PHISHING_RESISTANT and verified != required:
            raise Forbidden(error="PLATFORM_PHISHING_RESISTANT_VERIFICATION_REQUIRED")

    @staticmethod
    def _expires_at(*, policy: PlatformActionPolicy, now: datetime) -> datetime:
        if policy.freshness_seconds is None or policy.freshness_seconds <= 0:
            raise Conflict(error="PLATFORM_STEP_UP_FRESHNESS_POLICY_INVALID")
        return now + timedelta(seconds=policy.freshness_seconds)

    @staticmethod
    def _require_proof_context(
        *,
        proof: PlatformStepUpProof,
        request: PlatformStepUpProofConsumeRequest,
        policy: PlatformActionPolicy,
    ) -> None:
        matches = (
            UUID(str(proof.actor_user_id)) == request.actor_user_id
            and UUID(str(proof.session_id)) == request.session_id
            and UUID(str(proof.action_policy_id)) == UUID(str(policy.id))
            and proof.target_type == request.target_type
            and (UUID(str(proof.target_id)) if proof.target_id is not None else None) == request.target_id
            and proof.scope == request.scope
            and proof.expected_revision == request.expected_revision
            and proof.preview_revision == request.preview_revision
            and proof.policy_revision == policy.policy_revision
        )
        if not matches:
            raise Conflict(error="PLATFORM_STEP_UP_CONTEXT_CHANGED")
        if proof.idempotency_key != request.idempotency_key:
            raise Conflict(error="PLATFORM_STEP_UP_IDEMPOTENCY_MISMATCH")

    @staticmethod
    def _require_active_proof(*, proof: PlatformStepUpProof, now: datetime) -> None:
        if proof.status == PlatformStepUpProofStatus.CONSUMED:
            raise Conflict(error="PLATFORM_STEP_UP_PROOF_CONSUMED")
        if proof.status != PlatformStepUpProofStatus.ACTIVE:
            raise Conflict(error="PLATFORM_STEP_UP_PROOF_INVALIDATED")
        if proof.expires_at <= now:
            raise Conflict(error="PLATFORM_STEP_UP_PROOF_EXPIRED")


def _proof_hash(proof: str) -> str:
    return sha256(proof.encode("utf-8")).hexdigest()
