from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.models.platform_identity.operations import (
    PlatformStepUpProofStatus,
    PlatformVerificationAssurance,
)


class _Repository:
    def __init__(self) -> None:
        self.actor_id = uuid4()
        self.session_id = uuid4()
        self.policy_id = uuid4()
        self.created: dict[str, object] | None = None
        self.proofs: dict[str, SimpleNamespace] = {}
        self.permission_granted = True
        self.consume_count = 0
        self.policy = SimpleNamespace(
            id=self.policy_id,
            code="platform.access.reset_operator_mfa",
            permission=SimpleNamespace(code="platform:access-mfa:reset"),
            requires_step_up=True,
            required_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
            freshness_seconds=300,
            policy_revision=7,
            is_active=True,
        )
        self.alternate_policy = SimpleNamespace(
            id=uuid4(),
            code="platform.access.remove_operator",
            permission=SimpleNamespace(code="platform:access-team:remove"),
            requires_step_up=True,
            required_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
            freshness_seconds=300,
            policy_revision=7,
            is_active=True,
        )
        self.session = SimpleNamespace(
            id=self.session_id,
            actor_user_id=self.actor_id,
            revoked_at=None,
            inactivity_expires_at=datetime(2030, 1, 1, tzinfo=UTC),
            absolute_expires_at=datetime(2030, 1, 1, tzinfo=UTC),
        )

    @asynccontextmanager
    async def transaction(self):
        yield object()

    async def get_action_policy(self, *, action_code: str, conn: object, for_update: bool = False):
        return next(
            (policy for policy in (self.policy, self.alternate_policy) if action_code == policy.code),
            None,
        )

    async def get_platform_session(self, *, session_id: UUID, conn: object, for_update: bool = False):
        return self.session if session_id == self.session_id else None

    async def actor_has_permission(
        self, *, actor_user_id: UUID, permission_code: str, at: datetime, conn: object
    ) -> bool:
        return (
            self.permission_granted
            and actor_user_id == self.actor_id
            and permission_code == self.policy.permission.code
        )

    async def create_step_up_proof(self, *, values: dict[str, object], conn: object):
        self.created = values
        proof = SimpleNamespace(id=uuid4(), **values)
        self.proofs[str(values["proof_hash"])] = proof
        return proof

    async def get_step_up_proof_by_hash(self, *, proof_hash: str, conn: object, for_update: bool = False):
        return self.proofs.get(proof_hash)

    async def mark_step_up_proof_consumed(self, *, proof: SimpleNamespace, consumed_at: datetime, conn: object) -> None:
        self.consume_count += 1
        proof.status = PlatformStepUpProofStatus.CONSUMED
        proof.consumed_at = consumed_at


def _request(repository: _Repository):
    from src.modules.platform_identity.step_up_schema import PlatformStepUpProofIssueRequest

    return PlatformStepUpProofIssueRequest(
        actor_user_id=repository.actor_id,
        session_id=repository.session_id,
        action_code=repository.policy.code,
        target_type="platform_operator",
        target_id=uuid4(),
        scope={"operator_ids": ["target-1"]},
        expected_revision=11,
        preview_revision=19,
        idempotency_key="reset-mfa-1",
    )


@pytest.mark.asyncio
async def test_issue_returns_raw_proof_once_and_persists_only_its_hash() -> None:
    from src.modules.platform_identity.step_up import PlatformStepUpService

    repository = _Repository()
    now = datetime(2029, 1, 1, tzinfo=UTC)
    service = PlatformStepUpService(repository=repository, now=lambda: now, proof_factory=lambda: "raw-proof")

    issued = await service.issue(
        request=_request(repository),
        verified_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )

    assert issued.proof == "raw-proof"
    assert issued.proof_id in {proof.id for proof in repository.proofs.values()}
    assert repository.created is not None
    assert repository.created["proof_hash"] != "raw-proof"
    assert "proof" not in repository.created
    assert repository.created["policy_revision"] == 7
    assert repository.created["expires_at"] == now + timedelta(seconds=300)


@pytest.mark.asyncio
async def test_phishing_resistant_action_rejects_totp_assurance() -> None:
    from src.core.exceptions import Forbidden
    from src.modules.platform_identity.step_up import PlatformStepUpService

    repository = _Repository()
    service = PlatformStepUpService(repository=repository)

    with pytest.raises(Forbidden, match="PLATFORM_PHISHING_RESISTANT_VERIFICATION_REQUIRED"):
        await service.issue(
            request=_request(repository),
            verified_assurance=PlatformVerificationAssurance.LOCAL_MFA,
        )

    assert repository.created is None


@pytest.mark.asyncio
async def test_consume_is_atomic_and_same_idempotency_returns_same_receipt() -> None:
    from src.core.exceptions import Conflict
    from src.modules.platform_identity.step_up import PlatformStepUpService
    from src.modules.platform_identity.step_up_schema import PlatformStepUpProofConsumeRequest

    repository = _Repository()
    now = datetime(2029, 1, 1, tzinfo=UTC)
    service = PlatformStepUpService(repository=repository, now=lambda: now, proof_factory=lambda: "raw-proof")
    issue_request = _request(repository)
    issued = await service.issue(
        request=issue_request,
        verified_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )
    consume_request = PlatformStepUpProofConsumeRequest(**issue_request.model_dump(), proof=issued.proof)

    first = await service.consume(request=consume_request)
    retry = await service.consume(request=consume_request)

    assert first.proof_id == issued.proof_id
    assert retry == first
    assert repository.consume_count == 1
    assert next(iter(repository.proofs.values())).status == PlatformStepUpProofStatus.CONSUMED

    changed_scope = consume_request.model_copy(update={"scope": {"operator_ids": ["target-2"]}})
    with pytest.raises(Conflict, match="PLATFORM_STEP_UP_CONTEXT_CHANGED"):
        await service.consume(request=changed_scope)

    changed_action = consume_request.model_copy(update={"action_code": repository.alternate_policy.code})
    with pytest.raises(Conflict, match="PLATFORM_STEP_UP_CONTEXT_CHANGED"):
        await service.consume(request=changed_action)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mutation", "error"),
    [
        ("expired", "PLATFORM_STEP_UP_PROOF_EXPIRED"),
        ("revoked_session", "PLATFORM_SESSION_REVOKED"),
        ("policy_drift", "PLATFORM_STEP_UP_CONTEXT_CHANGED"),
        ("actor_mismatch", "PLATFORM_STEP_UP_CONTEXT_CHANGED"),
        ("permission_loss", "PLATFORM_PERMISSION_DENIED"),
    ],
)
async def test_consume_explicitly_rejects_invalidated_action_context(mutation: str, error: str) -> None:
    from src.core.exceptions import APIError
    from src.modules.platform_identity.step_up import PlatformStepUpService
    from src.modules.platform_identity.step_up_schema import PlatformStepUpProofConsumeRequest

    repository = _Repository()
    now = datetime(2029, 1, 1, tzinfo=UTC)
    service = PlatformStepUpService(repository=repository, now=lambda: now, proof_factory=lambda: "raw-proof")
    issue_request = _request(repository)
    issued = await service.issue(
        request=issue_request,
        verified_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )
    consume_request = PlatformStepUpProofConsumeRequest(**issue_request.model_dump(), proof=issued.proof)
    proof = next(iter(repository.proofs.values()))

    if mutation == "expired":
        proof.expires_at = now
    elif mutation == "revoked_session":
        repository.session.revoked_at = now
    elif mutation == "policy_drift":
        repository.policy.policy_revision += 1
    elif mutation == "actor_mismatch":
        consume_request = consume_request.model_copy(update={"actor_user_id": uuid4()})
    elif mutation == "permission_loss":
        repository.permission_granted = False

    with pytest.raises(APIError) as exc:
        await service.consume(request=consume_request)

    assert exc.value.error == error
