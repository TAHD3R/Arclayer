from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.models.agents.runtime_delegation_v1 import AgentDelegationStatusV1, AgentDelegationV1Record
from src.models.agents.runtime_output_v1 import AgentChangeSetV1Record
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunEventV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.models.ai.ai_budget import AIBudget, BudgetSourceType
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.models.commerce.billing import CreditLedgerEntryType, WorkspaceCreditLedger
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_output_protocol_schema import (
    ChangeSetProposedEventV1,
    RunCancelledEventV1,
    RunCompletedEventV1,
    RunFailedEventV1,
    UsageUpdatedEventV1,
)
from src.modules.ai.runtime_protocol_schema import (
    MessagePartCompletedEventV1,
    MessagePartStartedEventV1,
    RunCancelRequestedEventV1,
    RunCreatedEventV1,
    RunStartedEventV1,
)
from src.modules.ai.runtime_repository import AgentRuntimePersistenceError, AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)

pytestmark = pytest.mark.integration


def _event(envelope: dict[str, object], event_type: str, sequence: int, data: dict[str, object]) -> dict[str, object]:
    return {
        **envelope,
        "eventId": f"event-output-{sequence}",
        "cursor": f"cursor-output-{sequence}",
        "type": event_type,
        "sequence": sequence,
        "occurredAt": f"2026-07-19T06:00:{sequence:02d}.000Z",
        "data": data,
    }


async def _running_run() -> tuple[AgentRuntimeRepository, AgentThreadV1Record, UUID, dict[str, object]]:
    owner_id = uuid4()
    organization = await Organization.create(
        slug=f"output-org-{uuid4().hex[:10]}",
        name="Output Org",
        owner_user_id=owner_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Output Workspace",
        is_active=True,
        owner_user_id=owner_id,
        created_by_user_id=owner_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"output-project-{uuid4().hex[:10]}",
        name="Output Project",
        is_active=True,
        created_by_user_id=owner_id,
    )
    thread = await AgentThreadV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        owner_user_id=owner_id,
        lead_agent_id=str(TEST_LEAD_AGENT_ID),
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        title="Output",
    )
    run_id = uuid4()
    envelope: dict[str, object] = {
        "eventVersion": 1,
        "runId": str(run_id),
        "threadId": str(thread.id),
        "correlationId": f"correlation-output-{run_id}",
        "spanId": None,
        "parentSpanId": None,
    }
    repository = AgentRuntimeRepository()
    command = AgentRunCreatePersistenceCommand(
        run_id=run_id,
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=owner_id,
        lead_agent_id=TEST_LEAD_AGENT_ID,
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        execution_mode="build",
        site_revision_id=None,
        message="Produce a terminal result.",
        idempotency_key=f"output-run-{run_id}",
        correlation_id=str(envelope["correlationId"]),
    )
    created = RunCreatedEventV1.model_validate(
        _event(
            envelope,
            "run.created",
            1,
            {
                "run": {
                    "status": "created",
                    "executionMode": "build",
                    "leadAgentId": str(TEST_LEAD_AGENT_ID),
                    "createdAt": "2026-07-19T06:00:01.000Z",
                },
            },
        )
    )
    started = RunStartedEventV1.model_validate(
        _event(
            envelope,
            "run.started",
            2,
            {
                "startedAt": "2026-07-19T06:00:02.000Z",
                "attemptNumber": 1,
                "agentVersionId": "agent-version-lead",
            },
        )
    )
    await repository.create_run_with_first_event(command=command, event=created)
    await repository.append_event(event=started)
    return repository, thread, run_id, envelope


def _usage(settlement: str) -> dict[str, object]:
    return {
        "provider": "openai",
        "model": "gpt-5",
        "inputTokens": 120,
        "outputTokens": 48,
        "totalTokens": 168,
        "providerCost": "0.0042",
        "currency": "USD",
        "credits": "4",
        "settlement": settlement,
    }


async def _credit_settlement_proof(
    *,
    run_id: UUID,
    status: ReservationStatus,
    actual_cost_micros: int | None,
    reserved_credits: int,
    actual_credits: int | None,
) -> AIBudgetReservation:
    run = await AgentRunV1Record.get(id=run_id)
    budget = await AIBudget.create(
        source_type=BudgetSourceType.WORKSPACE,
        source_id=run.workspace_id,
        limit_micros=100_000,
        spent_micros=actual_cost_micros or 0,
        period_start=datetime.now(UTC).date(),
    )
    request_id = uuid4()
    account_id = uuid4()
    reservation = await AIBudgetReservation.create(
        budget_id=budget.id,
        agent_run_id=run.id,
        request_id=request_id,
        estimated_cost_micros=5_000,
        reserved_cost_micros=5_000,
        actual_cost_micros=actual_cost_micros,
        credit_account_id=account_id,
        credit_value_micros=1_000,
        reserved_credits=reserved_credits,
        actual_credits=actual_credits,
        credits_reconciled_at=datetime.now(UTC),
        status=status,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    is_committed = status == ReservationStatus.COMMITTED
    entry_type = CreditLedgerEntryType.COMMIT if is_committed else CreditLedgerEntryType.RELEASE
    details: dict[str, object]
    if is_committed:
        details = {
            "actualCostMicros": actual_cost_micros,
            "creditValueMicros": 1_000,
            "reservedCredits": reserved_credits,
            "actualCredits": actual_credits,
        }
    else:
        details = {"reason": "provider_request_released", "reservedCredits": reserved_credits}
    await WorkspaceCreditLedger.create(
        workspace_id=run.workspace_id,
        account_id=account_id,
        entry_type=entry_type,
        delta_balance_credits=-(actual_credits or 0),
        delta_reserved_credits=-reserved_credits,
        balance_after_credits=100 - (actual_credits or 0),
        reserved_after_credits=0,
        reference_type="ai_request",
        reference_id=request_id,
        idempotency_key=(
            f"ai-credit-commit:{request_id}"
            if is_committed
            else f"ai-credit-release:{request_id}:provider_request_released"
        ),
        actor_user_id=None,
        description_key="LEDGER_AI_COMMIT" if is_committed else "LEDGER_AI_RELEASE",
        details=details,
    )
    return reservation


def _failed_event(
    *,
    envelope: dict[str, object],
    sequence: int,
    outcome: str,
    credits_released: str,
    message: str = "Provider request failed.",
) -> RunFailedEventV1:
    return RunFailedEventV1.model_validate(
        _event(
            envelope,
            "run.failed",
            sequence,
            {
                "failedAt": f"2026-07-19T06:00:{sequence:02d}.000Z",
                "error": {
                    "code": "AGENT_PROVIDER_FAILED",
                    "message": message,
                    "retryable": True,
                    "details": {"provider": "openai"},
                },
                "incompletePartIds": [],
                "settlement": {
                    "outcome": outcome,
                    "usage": None,
                    "creditsCommitted": "0",
                    "creditsReleased": credits_released,
                },
            },
        )
    )


@pytest.mark.asyncio
async def test_completed_run_requires_final_message_and_matching_committed_usage(prepared_db) -> None:
    _ = prepared_db
    repository, _, run_id, envelope = await _running_run()
    message_id, part_id = uuid4(), uuid4()
    await repository.append_event(
        event=MessagePartStartedEventV1.model_validate(
            _event(
                envelope,
                "message.part.started",
                3,
                {
                    "message": {
                        "messageId": str(message_id),
                        "role": "assistant",
                        "agentId": "agent-lead",
                        "createdAt": "2026-07-19T06:00:03.000Z",
                        "placement": {"kind": "thread"},
                    },
                    "part": {
                        "partId": str(part_id),
                        "partIndex": 0,
                        "type": "text",
                        "status": "running",
                        "text": "Done",
                    },
                },
            )
        )
    )
    await repository.append_event(
        event=MessagePartCompletedEventV1.model_validate(
            _event(
                envelope,
                "message.part.completed",
                4,
                {
                    "messageId": str(message_id),
                    "part": {
                        "partId": str(part_id),
                        "partIndex": 0,
                        "type": "text",
                        "status": "complete",
                        "text": "Done",
                    },
                },
            )
        )
    )
    await repository.append_event(
        event=UsageUpdatedEventV1.model_validate(
            _event(
                envelope,
                "usage.updated",
                5,
                {
                    "usage": _usage("provisional"),
                    "providerOccurredAt": "2026-07-19T06:00:05.000Z",
                },
            )
        )
    )
    await _credit_settlement_proof(
        run_id=run_id,
        status=ReservationStatus.COMMITTED,
        actual_cost_micros=4_200,
        reserved_credits=5,
        actual_credits=4,
    )
    completed = RunCompletedEventV1.model_validate(
        _event(
            envelope,
            "run.completed",
            6,
            {
                "completedAt": "2026-07-19T06:00:06.000Z",
                "assistantMessageId": str(message_id),
                "usage": _usage("committed"),
                "finishReason": "stop",
            },
        )
    )
    await repository.append_event(event=completed)
    run = await AgentRunV1Record.get(id=run_id)
    assert str(run.status) == "completed"
    assert run.usage["settlement"] == "committed"
    assert run.settlement["outcome"] == "committed"
    assert run.last_sequence == 6


@pytest.mark.asyncio
async def test_cancelled_run_atomically_marks_exact_running_parts_incomplete(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, envelope = await _running_run()
    message_id, part_id = uuid4(), uuid4()
    await repository.append_event(
        event=MessagePartStartedEventV1.model_validate(
            _event(
                envelope,
                "message.part.started",
                3,
                {
                    "message": {
                        "messageId": str(message_id),
                        "role": "assistant",
                        "agentId": "agent-lead",
                        "createdAt": "2026-07-19T06:00:03.000Z",
                        "placement": {"kind": "thread"},
                    },
                    "part": {
                        "partId": str(part_id),
                        "partIndex": 0,
                        "type": "text",
                        "status": "running",
                        "text": "Partial",
                    },
                },
            )
        )
    )
    await repository.append_event(
        event=RunCancelRequestedEventV1.model_validate(
            _event(
                envelope,
                "run.cancel.requested",
                4,
                {
                    "requestedAt": "2026-07-19T06:00:04.000Z",
                    "requestedByActorId": str(thread.owner_user_id),
                },
            )
        )
    )
    await _credit_settlement_proof(
        run_id=run_id,
        status=ReservationStatus.RELEASED,
        actual_cost_micros=None,
        reserved_credits=10,
        actual_credits=None,
    )
    cancelled_raw = _event(
        envelope,
        "run.cancelled",
        5,
        {
            "cancelledAt": "2026-07-19T06:00:05.000Z",
            "reasonCode": "user_cancelled",
            "incompletePartIds": [str(part_id)],
            "settlement": {"outcome": "released", "usage": None, "creditsCommitted": "0", "creditsReleased": "10"},
        },
    )
    invalid = RunCancelledEventV1.model_validate({
        **cancelled_raw,
        "data": {**cast(JsonObject, cancelled_raw["data"]), "incompletePartIds": []},
    })
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TERMINAL_INCOMPLETE_PARTS_MISMATCH"):
        await repository.append_event(event=invalid)
    await repository.append_event(event=RunCancelledEventV1.model_validate(cancelled_raw))
    part = await AgentMessagePartV1Record.get(id=part_id)
    message = await AgentMessageV1Record.get(id=message_id)
    run = await AgentRunV1Record.get(id=run_id)
    assert part.status == "incomplete"
    assert message.status == "incomplete"
    assert str(run.status) == "cancelled"
    assert run.last_sequence == 5


@pytest.mark.asyncio
async def test_terminal_waits_for_reservation_and_credit_reconciliation(prepared_db) -> None:
    _ = prepared_db
    repository, _, run_id, envelope = await _running_run()
    run = await AgentRunV1Record.get(id=run_id)
    budget = await AIBudget.create(
        source_type=BudgetSourceType.WORKSPACE,
        source_id=run.workspace_id,
        limit_micros=100_000,
        reserved_micros=5_000,
        period_start=datetime.now(UTC).date(),
    )
    reservation = await AIBudgetReservation.create(
        budget_id=budget.id,
        agent_run_id=run.id,
        request_id=uuid4(),
        estimated_cost_micros=5_000,
        reserved_cost_micros=5_000,
        credit_account_id=uuid4(),
        credit_value_micros=1_000,
        reserved_credits=5,
        status=ReservationStatus.RESERVED,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    failed = _failed_event(
        envelope=envelope,
        sequence=3,
        outcome="released",
        credits_released="5",
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TERMINAL_SETTLEMENT_PENDING"):
        await repository.append_event(event=failed)
    reservation.status = ReservationStatus.RELEASED
    await reservation.save(update_fields=["status", "updated_at"])
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TERMINAL_CREDIT_PROOF_INVALID"):
        await repository.append_event(event=failed)
    run = await AgentRunV1Record.get(id=run_id)
    assert run.status == AgentRunStatusV1.RUNNING
    assert run.last_sequence == 2
    assert await AgentRunEventV1Record.filter(run_id=run_id).count() == 2


@pytest.mark.asyncio
async def test_failed_run_persists_verified_release_and_sanitized_error(prepared_db) -> None:
    _ = prepared_db
    repository, _, run_id, envelope = await _running_run()
    await _credit_settlement_proof(
        run_id=run_id,
        status=ReservationStatus.RELEASED,
        actual_cost_micros=None,
        reserved_credits=10,
        actual_credits=None,
    )
    failed = _failed_event(
        envelope=envelope,
        sequence=3,
        outcome="released",
        credits_released="10",
    )
    await repository.append_event(event=failed)
    run = await AgentRunV1Record.get(id=run_id)
    assert run.status == AgentRunStatusV1.FAILED
    assert run.error == {
        "code": "AGENT_PROVIDER_FAILED",
        "message": "Provider request failed.",
        "retryable": True,
        "details": {"provider": "openai"},
    }
    assert run.settlement == {
        "outcome": "released",
        "usage": None,
        "creditsCommitted": "0",
        "creditsReleased": "10",
    }


@pytest.mark.parametrize(
    ("usage_overrides", "error_code"),
    [
        ({"inputTokens": 119, "totalTokens": 167}, "AGENT_USAGE_REGRESSION"),
        ({"provider": "anthropic"}, "AGENT_USAGE_IDENTITY_MISMATCH"),
    ],
)
@pytest.mark.asyncio
async def test_usage_projection_rejects_regression_and_identity_drift(
    prepared_db,
    usage_overrides: dict[str, object],
    error_code: str,
) -> None:
    _ = prepared_db
    repository, _, run_id, envelope = await _running_run()
    initial = UsageUpdatedEventV1.model_validate(
        _event(
            envelope,
            "usage.updated",
            3,
            {"usage": _usage("provisional"), "providerOccurredAt": "2026-07-19T06:00:03.000Z"},
        )
    )
    await repository.append_event(event=initial)
    changed_usage = {**_usage("provisional"), **usage_overrides}
    changed = UsageUpdatedEventV1.model_validate(
        _event(
            envelope,
            "usage.updated",
            4,
            {"usage": changed_usage, "providerOccurredAt": "2026-07-19T06:00:04.000Z"},
        )
    )
    with pytest.raises(AgentRuntimePersistenceError, match=error_code):
        await repository.append_event(event=changed)
    run = await AgentRunV1Record.get(id=run_id)
    assert run.last_sequence == 3
    assert run.usage == _usage("provisional")


@pytest.mark.asyncio
async def test_changeset_proposal_has_durable_projection(prepared_db) -> None:
    _ = prepared_db
    repository, _, run_id, envelope = await _running_run()
    event = ChangeSetProposedEventV1.model_validate(
        _event(
            envelope,
            "changeset.proposed",
            3,
            {
                "changeSetId": "changeset-home-hero",
                "baseRevisionId": "revision-42",
                "previewRef": "artifact://changesets/home-hero",
                "summaryKey": "AI_CHANGESET_HOME_HERO",
                "summaryParams": {"page": "home"},
                "warnings": [
                    {
                        "code": "SEO_TITLE_CHANGED",
                        "messageKey": "AI_WARNING_SEO_TITLE_CHANGED",
                        "messageParams": {"page": "home"},
                    }
                ],
                "requiredApprovalIds": ["approval-publish-home"],
            },
        )
    )
    await repository.append_event(event=event)
    change_set = await AgentChangeSetV1Record.get(run_id=run_id)
    assert change_set.change_set_id == "changeset-home-hero"
    assert change_set.warnings[0]["code"] == "SEO_TITLE_CHANGED"
    assert change_set.required_approval_ids == ["approval-publish-home"]


@pytest.mark.asyncio
async def test_terminal_event_is_exactly_idempotent_and_last(prepared_db) -> None:
    _ = prepared_db
    repository, _, run_id, envelope = await _running_run()
    failed = _failed_event(
        envelope=envelope,
        sequence=3,
        outcome="reconciled",
        credits_released="0",
    )
    first = await repository.append_event(event=failed)
    replay = await repository.append_event(event=failed)
    assert replay == first
    assert await AgentRunEventV1Record.filter(run_id=run_id).count() == 3
    conflicting = _failed_event(
        envelope=envelope,
        sequence=3,
        outcome="reconciled",
        credits_released="0",
        message="A different failure.",
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_EVENT_ID_REUSED"):
        await repository.append_event(event=conflicting)
    later = _failed_event(
        envelope=envelope,
        sequence=4,
        outcome="reconciled",
        credits_released="0",
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_EVENT_TRANSITION_INVALID"):
        await repository.append_event(event=later)


@pytest.mark.asyncio
async def test_pending_approval_blocks_terminal_event(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, envelope = await _running_run()
    run = await AgentRunV1Record.get(id=run_id)
    message = await AgentMessageV1Record.create(
        thread_id=thread.id,
        run_id=run.id,
        role="assistant",
        status="running",
        agent_id="agent-lead",
    )
    part = await AgentMessagePartV1Record.create(
        message_id=message.id,
        part_index=0,
        type="tool-call",
        status="requires_action",
        tool_call_id="tool-call-pending-approval",
        payload={"type": "tool-call", "status": "requires_action"},
    )
    now = datetime.now(UTC)
    await AgentApprovalV1Record.create(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        thread_id=run.thread_id,
        run_id=run.id,
        message_part_id=part.id,
        owner_user_id=run.owner_user_id,
        approval_id="approval-pending-terminal",
        approval_version=1,
        tool_call_id="tool-call-pending-approval",
        checkpoint_id="checkpoint-pending-terminal",
        status=AgentApprovalStatusV1.PENDING,
        requested_at=now,
        expires_at=now + timedelta(minutes=10),
        policy_version="policy-v1",
        risk={"level": "high"},
        options=[{"optionId": "approve"}],
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TERMINAL_AUTHORITY_PENDING"):
        await repository.append_event(
            event=_failed_event(
                envelope=envelope,
                sequence=3,
                outcome="reconciled",
                credits_released="0",
            )
        )


@pytest.mark.asyncio
async def test_active_delegation_blocks_parent_terminal_event(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, envelope = await _running_run()
    run = await AgentRunV1Record.get(id=run_id)
    message = await AgentMessageV1Record.create(
        thread_id=thread.id,
        run_id=run.id,
        role="assistant",
        status="running",
        agent_id="agent-lead",
    )
    part = await AgentMessagePartV1Record.create(
        message_id=message.id,
        part_index=0,
        type="tool-call",
        status="running",
        tool_call_id="tool-call-delegation",
        payload={"type": "tool-call", "status": "running", "toolName": "agent.delegate"},
    )
    child = await AgentRunV1Record.create(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        thread_id=run.thread_id,
        owner_user_id=run.owner_user_id,
        idempotency_key=f"child-{uuid4()}",
        execution_mode="build",
        lead_agent_id="agent-child",
        mentioned_agent_ids=[],
        status=AgentRunStatusV1.RUNNING,
        correlation_id=run.correlation_id,
    )
    await AgentDelegationV1Record.create(
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        thread_id=run.thread_id,
        parent_run_id=run.id,
        child_run_id=child.id,
        parent_message_part_id=part.id,
        owner_user_id=run.owner_user_id,
        delegation_id="delegation-pending-terminal",
        parent_tool_call_id="tool-call-delegation",
        source_agent_version_id="agent-version-lead",
        target_agent_version_id="agent-version-child",
        status=AgentDelegationStatusV1.DELEGATED,
        delegated_at=datetime.now(UTC),
        objective_summary="Build the analytics section.",
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TERMINAL_AUTHORITY_PENDING"):
        await repository.append_event(
            event=_failed_event(
                envelope=envelope,
                sequence=3,
                outcome="reconciled",
                credits_released="0",
            )
        )
