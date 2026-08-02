from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.core.exceptions import Conflict
from src.models.hosting.commercial_access import (
    HostingDeliveryOperationAction,
    HostingDeliveryOperationState,
    HostingDeliveryOperationTargetType,
    HostingDeliveryOperationVerificationState,
)
from src.modules.platform_site_delivery.operation_repository import HostingDeliveryOperationRepository


@pytest.mark.usefixtures("db")
async def test_operation_repository_replays_the_exact_source_bound_command_and_preserves_unknown_outcome() -> None:
    repository = HostingDeliveryOperationRepository()
    actor_user_id = uuid4()
    target_id = uuid4()
    source_revision = datetime.now(UTC)

    operation, replayed = await repository.start(
        target_type=HostingDeliveryOperationTargetType.HOSTING_CONTINUITY,
        target_id=target_id,
        action=HostingDeliveryOperationAction.RESTORE,
        actor_user_id=actor_user_id,
        idempotency_key="hosting-operation-replay",
        source_revision=source_revision,
        before_state="restoration_required",
    )
    replay, replayed_again = await repository.start(
        target_type=HostingDeliveryOperationTargetType.HOSTING_CONTINUITY,
        target_id=target_id,
        action=HostingDeliveryOperationAction.RESTORE,
        actor_user_id=actor_user_id,
        idempotency_key="hosting-operation-replay",
        source_revision=source_revision,
        before_state="restoration_required",
    )

    assert not replayed
    assert replayed_again
    assert replay.id == operation.id
    assert replay.state is HostingDeliveryOperationState.RUNNING

    unknown = await repository.mark_outcome_unknown(
        operation_id=operation.id,
        failure_code="HOSTING_DELIVERY_SOURCE_OUTCOME_UNKNOWN",
        failure_message="Provider request outcome is unknown.",
        evidence={"outcome": "unknown", "source_error_type": "TimeoutError"},
    )

    assert unknown.state is HostingDeliveryOperationState.OUTCOME_UNKNOWN
    assert unknown.verification_state is HostingDeliveryOperationVerificationState.PENDING
    assert unknown.failure_code == "HOSTING_DELIVERY_SOURCE_OUTCOME_UNKNOWN"
    assert unknown.evidence == {"outcome": "unknown", "source_error_type": "TimeoutError"}
    assert unknown.completed_at is not None

    with pytest.raises(Conflict, match="HOSTING_DELIVERY_OPERATION_IDEMPOTENCY_KEY_REUSED"):
        await repository.find_replay(
            target_type=HostingDeliveryOperationTargetType.HOSTING_CONTINUITY,
            target_id=target_id,
            action=HostingDeliveryOperationAction.RETRY,
            actor_user_id=actor_user_id,
            idempotency_key="hosting-operation-replay",
            source_revision=source_revision,
        )
