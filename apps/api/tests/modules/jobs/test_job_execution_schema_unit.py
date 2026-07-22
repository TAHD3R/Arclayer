from __future__ import annotations

from datetime import UTC, datetime, timedelta
from inspect import signature
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import is_public_id
from src.models.jobs.background_job import JobInternalStatus, JobWorkloadClass
from src.modules.jobs.execution_errors import (
    JobExecutionLeaseLostError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)
from src.modules.jobs.execution_schema import (
    DurableJobExecutionOutcome,
    JobDeliveryClaim,
    JobDeliveryCommand,
    JobDeliveryDisposition,
    JobExecutionControlSnapshot,
    JobExecutionLease,
    JobExecutionTerminalOutcome,
    JobProgressUpdate,
)
from src.modules.jobs.reaper_schema import JobLeaseReapOutcome
from src.modules.jobs.schema import JobDispatchEnvelope

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 10, 0, tzinfo=UTC)


def _envelope(*, job_id: UUID | None = None) -> JobDispatchEnvelope:
    return JobDispatchEnvelope(
        job_id=job_id or uuid4(),
        dispatch_sequence=2,
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        workload_class=JobWorkloadClass.ASSET_CPU,
        target_descriptor={"assetId": "asset-reference"},
        request_fingerprint="a" * 64,
    )


def _lease(
    *,
    job_id: UUID | None = None,
    dispatch_sequence: int = 2,
) -> JobExecutionLease:
    return JobExecutionLease(
        job_id=job_id or uuid4(),
        attempt_id=uuid4(),
        dispatch_sequence=dispatch_sequence,
        attempt_number=dispatch_sequence,
        worker_id="asset-worker-1",
        fencing_token=uuid4(),
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        workload_class=JobWorkloadClass.ASSET_CPU,
        claimed_at=NOW,
        lease_until=NOW + timedelta(seconds=90),
        timeout_at=NOW + timedelta(minutes=10),
    )


def test_delivery_command_is_frozen_strict_and_contains_only_typed_envelope() -> None:
    command = JobDeliveryCommand(
        task_name=" jobs:asset-cpu:asset-thumbnail-generate:v1 ",
        envelope=_envelope(),
        worker_id=" asset-worker-1 ",
        transport_message_id=" taskiq-message-1 ",
        received_at=NOW,
    )

    assert command.task_name == "jobs:asset-cpu:asset-thumbnail-generate:v1"
    assert command.worker_id == "asset-worker-1"
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        JobDeliveryCommand.model_validate({**command.model_dump(), "queueName": "forbidden"})
    with pytest.raises(ValidationError, match="frozen_instance"):
        command.worker_id = "other-worker"
    with pytest.raises(ValidationError, match="Field required"):
        JobDeliveryCommand.model_validate(command.model_dump(exclude={"transport_message_id"}))


def test_execution_lease_serializes_internal_uuids_with_public_id_convention() -> None:
    lease = _lease()

    serialized = lease.model_dump(mode="json", by_alias=True)

    assert len(serialized["jobId"]) == 22
    assert len(serialized["attemptId"]) == 22
    assert len(serialized["fencingToken"]) == 22
    assert is_public_id(serialized["jobId"])


@pytest.mark.parametrize(
    ("attempt_number", "lease_until", "timeout_at", "message"),
    [
        (1, NOW + timedelta(seconds=1), NOW + timedelta(seconds=2), "attemptNumber"),
        (2, NOW, NOW + timedelta(seconds=1), "leaseUntil"),
        (2, NOW + timedelta(seconds=1), NOW, "timeoutAt"),
        (2, NOW + timedelta(seconds=2), NOW + timedelta(seconds=1), "cannot exceed timeoutAt"),
    ],
)
def test_execution_lease_rejects_non_future_authority_boundaries(
    attempt_number: int,
    lease_until: datetime,
    timeout_at: datetime,
    message: str,
) -> None:
    lease = _lease()
    with pytest.raises(ValidationError, match=message):
        JobExecutionLease.model_validate({
            **lease.model_dump(),
            "attempt_number": attempt_number,
            "lease_until": lease_until,
            "timeout_at": timeout_at,
        })


def test_claimed_delivery_requires_matching_lease_identity() -> None:
    job_id = uuid4()
    lease = _lease(job_id=job_id)

    claim = JobDeliveryClaim(
        job_id=job_id,
        dispatch_sequence=2,
        disposition=JobDeliveryDisposition.CLAIMED,
        lease=lease,
    )

    assert claim.lease is lease
    with pytest.raises(ValidationError, match="identities must match"):
        JobDeliveryClaim(
            job_id=uuid4(),
            dispatch_sequence=2,
            disposition=JobDeliveryDisposition.CLAIMED,
            lease=lease,
        )


def test_duplicate_delivery_dispositions_never_grant_a_new_fence() -> None:
    terminal = JobDeliveryClaim(
        job_id=uuid4(),
        dispatch_sequence=2,
        disposition=JobDeliveryDisposition.TERMINAL_DUPLICATE,
        terminal_status=JobInternalStatus.SUCCEEDED,
    )
    active_attempt_id = uuid4()
    active = JobDeliveryClaim(
        job_id=uuid4(),
        dispatch_sequence=2,
        disposition=JobDeliveryDisposition.ACTIVE_ATTEMPT_DUPLICATE,
        active_attempt_id=active_attempt_id,
    )
    reap_required = JobDeliveryClaim(
        job_id=uuid4(),
        dispatch_sequence=2,
        disposition=JobDeliveryDisposition.LEASE_REAP_REQUIRED,
        active_attempt_id=uuid4(),
    )
    stale = JobDeliveryClaim(
        job_id=uuid4(),
        dispatch_sequence=1,
        disposition=JobDeliveryDisposition.STALE_DELIVERY,
    )

    assert terminal.lease is None
    assert active.active_attempt_id == active_attempt_id
    assert reap_required.lease is None
    assert stale.active_attempt_id is None
    with pytest.raises(ValidationError, match="cannot carry Attempt"):
        JobDeliveryClaim(
            job_id=uuid4(),
            dispatch_sequence=1,
            disposition=JobDeliveryDisposition.STALE_DELIVERY,
            active_attempt_id=uuid4(),
        )
    with pytest.raises(ValidationError, match="require only activeAttemptId"):
        JobDeliveryClaim(
            job_id=uuid4(),
            dispatch_sequence=2,
            disposition=JobDeliveryDisposition.LEASE_REAP_REQUIRED,
        )
    with pytest.raises(ValidationError, match="cancelled terminal status"):
        JobDeliveryClaim(
            job_id=uuid4(),
            dispatch_sequence=2,
            disposition=JobDeliveryDisposition.CANCELLED_BEFORE_ATTEMPT,
            terminal_status=JobInternalStatus.FAILED,
        )


def test_durable_claimed_outcome_requires_identity_bound_terminal_evidence() -> None:
    lease = _lease()
    delivery = JobDeliveryClaim(
        job_id=lease.job_id,
        dispatch_sequence=lease.dispatch_sequence,
        disposition=JobDeliveryDisposition.CLAIMED,
        lease=lease,
    )
    terminal = JobExecutionTerminalOutcome(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        internal_status=JobInternalStatus.SUCCEEDED,
        completed_at=NOW + timedelta(minutes=1),
        result_reference={"assetId": "asset-reference"},
    )

    outcome = DurableJobExecutionOutcome(delivery=delivery, terminal=terminal)

    assert outcome.terminal is terminal
    with pytest.raises(ValidationError, match="require only a terminal"):
        DurableJobExecutionOutcome(delivery=delivery)
    with pytest.raises(ValidationError, match="match the claimed Job and Attempt"):
        DurableJobExecutionOutcome(
            delivery=delivery,
            terminal=terminal.model_copy(update={"attempt_id": uuid4()}),
        )


def test_waiting_for_user_outcome_requires_only_continuation_evidence() -> None:
    lease = _lease()
    outcome = JobExecutionTerminalOutcome(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        internal_status=JobInternalStatus.WAITING_FOR_USER,
        continuation_reference={"checkpointId": "checkpoint-1", "runId": "run-1"},
    )

    assert outcome.completed_at is None
    assert outcome.continuation_reference == {"checkpointId": "checkpoint-1", "runId": "run-1"}
    with pytest.raises(ValidationError, match="waiting-for-user outcomes require only continuation evidence"):
        JobExecutionTerminalOutcome(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            internal_status=JobInternalStatus.WAITING_FOR_USER,
            completed_at=NOW,
            continuation_reference={"checkpointId": "checkpoint-1"},
        )
    with pytest.raises(ValidationError, match="waiting-for-user outcomes require only continuation evidence"):
        JobExecutionTerminalOutcome(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            internal_status=JobInternalStatus.WAITING_FOR_USER,
        )


def test_durable_reap_outcome_requires_identity_bound_recovery_evidence() -> None:
    job_id = uuid4()
    attempt_id = uuid4()
    delivery = JobDeliveryClaim(
        job_id=job_id,
        dispatch_sequence=2,
        disposition=JobDeliveryDisposition.LEASE_REAP_REQUIRED,
        active_attempt_id=attempt_id,
    )
    reaped = JobLeaseReapOutcome(
        job_id=job_id,
        attempt_id=attempt_id,
        internal_status=JobInternalStatus.DEAD_LETTERED,
    )

    outcome = DurableJobExecutionOutcome(delivery=delivery, lease_reap=reaped)

    assert outcome.lease_reap is reaped
    with pytest.raises(ValidationError, match="confirmed lease-reap"):
        DurableJobExecutionOutcome(delivery=delivery)
    with pytest.raises(ValidationError, match="match the expired Job and Attempt"):
        DurableJobExecutionOutcome(
            delivery=delivery,
            lease_reap=reaped.model_copy(update={"job_id": uuid4()}),
        )


def test_durable_non_executing_outcome_rejects_terminal_or_reap_evidence() -> None:
    job_id = uuid4()
    delivery = JobDeliveryClaim(
        job_id=job_id,
        dispatch_sequence=2,
        disposition=JobDeliveryDisposition.TERMINAL_DUPLICATE,
        terminal_status=JobInternalStatus.SUCCEEDED,
    )
    terminal = JobExecutionTerminalOutcome(
        job_id=job_id,
        attempt_id=uuid4(),
        internal_status=JobInternalStatus.SUCCEEDED,
        completed_at=NOW + timedelta(minutes=1),
        result_reference={"assetId": "asset-reference"},
    )

    outcome = DurableJobExecutionOutcome(delivery=delivery)

    assert outcome.terminal is None
    with pytest.raises(ValidationError, match="non-executing"):
        DurableJobExecutionOutcome(delivery=delivery, terminal=terminal)


def test_control_snapshot_requires_live_fence_and_coherent_cancellation() -> None:
    lease = _lease()
    snapshot = JobExecutionControlSnapshot(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        fencing_token=lease.fencing_token,
        observed_at=NOW + timedelta(seconds=30),
        lease_until=NOW + timedelta(seconds=120),
        timeout_at=lease.timeout_at,
        cancel_requested_at=NOW + timedelta(seconds=20),
        cancel_requested_by_user_id=uuid4(),
        cancel_reason="User requested cancellation",
    )

    assert snapshot.cancellation_requested is True
    with pytest.raises(ValidationError, match="expired lease"):
        JobExecutionControlSnapshot(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            fencing_token=lease.fencing_token,
            observed_at=NOW + timedelta(seconds=120),
            lease_until=NOW + timedelta(seconds=120),
        )
    with pytest.raises(ValidationError, match="require cancelRequestedAt"):
        JobExecutionControlSnapshot(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            fencing_token=lease.fencing_token,
            observed_at=NOW,
            lease_until=NOW + timedelta(seconds=90),
            cancel_reason="orphan reason",
        )
    with pytest.raises(ValidationError, match="lease cannot exceed timeoutAt"):
        JobExecutionControlSnapshot(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            fencing_token=lease.fencing_token,
            observed_at=NOW,
            lease_until=NOW + timedelta(seconds=120),
            timeout_at=NOW + timedelta(seconds=90),
        )


def test_progress_update_is_absolute_and_cannot_exceed_total() -> None:
    update = JobProgressUpdate(
        phase="generating",
        status_key="jobs.assetThumbnail.generating",
        progress_completed=3,
        progress_total=8,
    )

    assert update.model_dump(by_alias=True) == {
        "phase": "generating",
        "statusKey": "jobs.assetThumbnail.generating",
        "progressCompleted": 3,
        "progressTotal": 8,
    }
    assert "delta" not in JobProgressUpdate.model_fields
    with pytest.raises(ValidationError, match="cannot exceed"):
        JobProgressUpdate(phase="generating", progress_completed=9, progress_total=8)


def test_execution_errors_preserve_raw_retry_hint_for_central_evaluation() -> None:
    permanent = PermanentJobExecutionError(
        code="ASSET_THUMBNAIL_TARGET_NOT_FOUND",
        safe_message="Asset no longer exists",
    )
    transient = TransientJobExecutionError(
        code="ASSET_STORAGE_TEMPORARILY_UNAVAILABLE",
        safe_message="Storage provider is temporarily unavailable",
        provider_retry_after_seconds=15,
    )

    assert permanent.code == "ASSET_THUMBNAIL_TARGET_NOT_FOUND"
    assert transient.provider_retry_after_seconds == 15
    assert "retry_at" not in signature(TransientJobExecutionError).parameters
    invalid_hint = TransientJobExecutionError(
        code="ASSET_STORAGE_TEMPORARILY_UNAVAILABLE",
        safe_message="Storage provider is temporarily unavailable",
        provider_retry_after_seconds=0,
    )
    assert invalid_hint.provider_retry_after_seconds == 0


def test_lease_lost_and_unexpected_errors_use_stable_sanitized_codes() -> None:
    job_id = uuid4()
    attempt_id = uuid4()
    lease_lost = JobExecutionLeaseLostError(
        job_id=job_id,
        attempt_id=attempt_id,
        reason="Attempt lease expired",
    )
    unexpected = UnexpectedJobExecutionError(handler="asset.thumbnail.generate")

    assert lease_lost.code == "BACKGROUND_JOB_LEASE_LOST"
    assert lease_lost.job_id == job_id
    assert lease_lost.attempt_id == attempt_id
    assert unexpected.code == "BACKGROUND_JOB_HANDLER_UNEXPECTED"
    assert "provider" not in unexpected.safe_message.lower()


def test_execution_error_evidence_is_bounded_sanitized_and_immutable() -> None:
    source_metadata: JsonObject = {"providerRequestId": "request-1"}
    error = TransientJobExecutionError(
        code="PROVIDER_UNAVAILABLE",
        safe_message="Provider is temporarily unavailable",
        metadata=source_metadata,
    )
    source_metadata["providerRequestId"] = "mutated"
    returned_metadata = error.metadata
    assert returned_metadata is not None
    returned_metadata["providerRequestId"] = "also-mutated"

    assert error.metadata == {"providerRequestId": "request-1"}
    with pytest.raises(ValueError, match="stable uppercase"):
        PermanentJobExecutionError(code="provider-unavailable", safe_message="Invalid code")
    with pytest.raises(ValueError, match="sensitive or unbounded"):
        PermanentJobExecutionError(
            code="PROVIDER_FAILURE",
            safe_message="Provider failed",
            metadata={"rawProviderBody": "must not persist"},
        )
    with pytest.raises(ValueError, match="finite"):
        PermanentJobExecutionError(
            code="PROVIDER_FAILURE",
            safe_message="Provider failed",
            metadata={"retryDelay": float("inf")},
        )
