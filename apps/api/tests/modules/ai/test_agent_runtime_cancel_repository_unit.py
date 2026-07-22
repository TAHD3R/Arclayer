from __future__ import annotations

from uuid import uuid4

import pytest

from src.models.agents.runtime_v1 import AgentRunStatusV1
from src.models.ai.ai_budget_reservation import ReservationStatus
from src.modules.ai.runtime_cancel_repository import AgentRunCancellationState


@pytest.mark.parametrize(
    ("reservation_statuses", "expected"),
    [
        ((), True),
        ((ReservationStatus.COMMITTED,), True),
        ((ReservationStatus.RELEASED,), True),
        ((ReservationStatus.EXPIRED,), True),
        ((ReservationStatus.RESERVED,), False),
        ((ReservationStatus.COMMITTED, ReservationStatus.RESERVED), False),
    ],
)
def test_interrupted_run_can_cancel_immediately_when_all_reservations_are_settled(
    reservation_statuses: tuple[ReservationStatus, ...],
    expected: bool,
) -> None:
    state = AgentRunCancellationState(
        run_id=uuid4(),
        job_id=uuid4(),
        workspace_id=uuid4(),
        thread_id=uuid4(),
        owner_user_id=uuid4(),
        status=AgentRunStatusV1.INTERRUPTED,
        correlation_id="cancel-settlement-test",
        last_sequence=6,
        last_cursor="cursor-6",
        running_part_ids=(),
        reservation_statuses=reservation_statuses,
    )

    assert state.can_cancel_immediately is expected
