from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.common.utils.public_ids import encode_uuid
from src.core.exceptions import Conflict
from src.models.agents.runtime_v1 import (
    AgentApprovalV1Record,
    AgentRunEventV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
    AgentToolResponseV1Record,
)
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
)
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalRequiredEventV1,
    RunInterruptedEventV1,
)
from src.modules.ai.runtime_command_schema import (
    AgentApprovalResponseRequestV1,
    AgentHumanToolResultRequestV1,
    ResumeAgentRunRequestV1,
)
from src.modules.ai.runtime_command_service import AgentRuntimeCommandService
from src.modules.ai.runtime_protocol_schema import MessagePartStartedEventV1, RunStartedEventV1
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from tests.modules.ai.test_agent_runtime_approval_projection_integration import (
    _approval,
    _canonical,
    _create_running_run,
    _event,
)
from tests.modules.ai.test_agent_runtime_job_handler_integration import _create_queued_run

pytestmark = pytest.mark.integration


async def _interrupt_for_approval():  # type: ignore[no-untyped-def]
    repository, thread, run_id, envelope = await _create_running_run()
    message_id = uuid4()
    part_id = uuid4()
    args = {"revisionId": "revision-command-1", "target": "production"}
    approval = _approval()
    now = datetime.now(UTC)
    approval["requestedAt"] = (now - timedelta(minutes=1)).isoformat()
    approval["expiresAt"] = (now + timedelta(hours=1)).isoformat()
    await repository.append_event(
        event=MessagePartStartedEventV1.model_validate(
            _event(
                envelope,
                event_type="message.part.started",
                sequence=3,
                data={
                    "message": {
                        "messageId": str(message_id),
                        "role": "assistant",
                        "agentId": "agent-lead",
                        "createdAt": now.isoformat(),
                        "placement": {"kind": "thread"},
                    },
                    "part": {
                        "partId": str(part_id),
                        "partIndex": 0,
                        "type": "tool-call",
                        "status": "running",
                        "toolCallId": "tool-call-command-approval",
                        "toolName": "site.publish",
                        "args": args,
                        "argsText": _canonical(args),
                    },
                },
            )
        )
    )
    approval["approvalId"] = "approval-command-1"
    approval["toolCallId"] = "tool-call-command-approval"
    approval["checkpointId"] = "checkpoint-command-approval"
    await repository.append_event(
        event=ApprovalRequiredEventV1.model_validate(
            _event(
                envelope,
                event_type="approval.required",
                sequence=4,
                data={"approval": approval, "messageId": str(message_id), "partId": str(part_id)},
            )
        )
    )
    await repository.append_event(
        event=RunInterruptedEventV1.model_validate(
            _event(
                envelope,
                event_type="run.interrupted",
                sequence=5,
                data={
                    "interruptId": "interrupt-command-approval",
                    "checkpointId": "checkpoint-command-approval",
                    "reason": "approval_required",
                    "approvalId": "approval-command-1",
                    "toolCallId": "tool-call-command-approval",
                },
            )
        )
    )
    return thread, run_id


async def _interrupt_for_human_result():  # type: ignore[no-untyped-def]
    repository, thread, run_id, envelope = await _create_running_run()
    message_id = uuid4()
    part_id = uuid4()
    args = {"questionKey": "agents.questions.chooseAudience"}
    await repository.append_event(
        event=MessagePartStartedEventV1.model_validate(
            _event(
                envelope,
                event_type="message.part.started",
                sequence=3,
                data={
                    "message": {
                        "messageId": str(message_id),
                        "role": "assistant",
                        "agentId": "agent-lead",
                        "createdAt": datetime.now(UTC).isoformat(),
                        "placement": {"kind": "thread"},
                    },
                    "part": {
                        "partId": str(part_id),
                        "partIndex": 0,
                        "type": "tool-call",
                        "status": "running",
                        "toolCallId": "tool-call-command-human",
                        "toolName": "human.choose",
                        "args": args,
                        "argsText": _canonical(args),
                    },
                },
            )
        )
    )
    await repository.append_event(
        event=RunInterruptedEventV1.model_validate(
            _event(
                envelope,
                event_type="run.interrupted",
                sequence=4,
                data={
                    "interruptId": "interrupt-command-human",
                    "checkpointId": "checkpoint-command-human",
                    "reason": "human_tool_input",
                    "toolCallId": "tool-call-command-human",
                },
            )
        )
    )
    return thread, run_id


async def test_approval_response_service_is_atomic_idempotent_and_sequence_bound(prepared_db) -> None:
    _ = prepared_db
    thread, run_id = await _interrupt_for_approval()
    payload = AgentApprovalResponseRequestV1(
        checkpoint_id="checkpoint-command-approval",
        kind="approval",
        approval_id="approval-command-1",
        approval_version=1,
        approved=True,
        option_id="allow_once",
        reason="Publish the reviewed revision.",
    )
    service = AgentRuntimeCommandService()

    response = await service.respond_to_tool_call(
        workspace_id=thread.workspace_id,
        actor_user_id=thread.owner_user_id,
        tool_call_id="tool-call-command-approval",
        idempotency_key="approval-command-idempotency",
        payload=payload,
    )
    replay = await service.respond_to_tool_call(
        workspace_id=thread.workspace_id,
        actor_user_id=thread.owner_user_id,
        tool_call_id="tool-call-command-approval",
        idempotency_key="approval-command-idempotency",
        payload=payload,
    )

    assert response == replay
    assert response.response_kind == "approval"
    assert response.expected_sequence == 6
    approval = await AgentApprovalV1Record.get(approval_id="approval-command-1")
    persisted = await AgentToolResponseV1Record.get(response_id=encode_uuid(response.response_id))
    assert str(approval.status) == "approved"
    assert persisted.expected_sequence == 6
    assert await AgentRunEventV1Record.filter(run_id=run_id, type="approval.resolved").count() == 1

    with pytest.raises(Conflict) as conflict:
        await service.respond_to_tool_call(
            workspace_id=thread.workspace_id,
            actor_user_id=thread.owner_user_id,
            tool_call_id="tool-call-command-approval",
            idempotency_key="approval-command-idempotency",
            payload=payload.model_copy(update={"approved": False, "option_id": None}),
        )
    assert conflict.value.error == "AGENT_TOOL_RESPONSE_IDEMPOTENCY_CONFLICT"


async def test_human_result_service_records_result_without_fabricating_resume_event(prepared_db) -> None:
    _ = prepared_db
    thread, run_id = await _interrupt_for_human_result()
    payload = AgentHumanToolResultRequestV1(
        checkpoint_id="checkpoint-command-human",
        kind="human_result",
        result={"audience": "design teams"},
    )
    service = AgentRuntimeCommandService()

    response = await service.respond_to_tool_call(
        workspace_id=thread.workspace_id,
        actor_user_id=thread.owner_user_id,
        tool_call_id="tool-call-command-human",
        idempotency_key="human-command-idempotency",
        payload=payload,
    )
    replay = await service.respond_to_tool_call(
        workspace_id=thread.workspace_id,
        actor_user_id=thread.owner_user_id,
        tool_call_id="tool-call-command-human",
        idempotency_key="human-command-idempotency",
        payload=payload,
    )

    assert response == replay
    assert response.response_kind == "human_result"
    assert response.expected_sequence == 4
    persisted = await AgentToolResponseV1Record.get(response_id=encode_uuid(response.response_id))
    assert persisted.expected_sequence == 4
    assert persisted.consumed_at is None
    assert not await AgentRunEventV1Record.filter(run_id=run_id, type="run.resumed").exists()


async def test_resume_service_consumes_exact_response_and_requeues_waiting_job(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    thread = await AgentThreadV1Record.get(id=run.thread_id)
    repository = AgentRuntimeRepository()
    envelope = {
        "eventVersion": 1,
        "runId": str(run.id),
        "threadId": str(run.thread_id),
        "correlationId": run.correlation_id,
        "spanId": None,
        "parentSpanId": None,
    }
    await repository.append_event(
        event=RunStartedEventV1.model_validate(
            _event(
                envelope,
                event_type="run.started",
                sequence=3,
                data={
                    "startedAt": "2026-07-19T06:00:03.000Z",
                    "attemptNumber": 1,
                    "agentVersionId": "content_builder:v1",
                },
            )
        )
    )
    message_id = uuid4()
    part_id = uuid4()
    args = {"questionKey": "agents.questions.chooseAudience"}
    await repository.append_event(
        event=MessagePartStartedEventV1.model_validate(
            _event(
                {**envelope, "spanId": "resume-span", "parentSpanId": "resume-parent"},
                event_type="message.part.started",
                sequence=4,
                data={
                    "message": {
                        "messageId": str(message_id),
                        "role": "assistant",
                        "agentId": "content_builder",
                        "createdAt": "2026-07-19T06:00:04.000Z",
                        "placement": {"kind": "thread"},
                    },
                    "part": {
                        "partId": str(part_id),
                        "partIndex": 0,
                        "type": "tool-call",
                        "status": "running",
                        "toolCallId": "tool-call-resume-human",
                        "toolName": "human.choose",
                        "args": args,
                        "argsText": _canonical(args),
                    },
                },
            )
        )
    )
    await repository.append_event(
        event=RunInterruptedEventV1.model_validate(
            _event(
                {**envelope, "spanId": "resume-span", "parentSpanId": "resume-parent"},
                event_type="run.interrupted",
                sequence=5,
                data={
                    "interruptId": "interrupt-resume-human",
                    "checkpointId": "checkpoint-resume-human",
                    "reason": "human_tool_input",
                    "toolCallId": "tool-call-resume-human",
                },
            )
        )
    )
    service = AgentRuntimeCommandService()
    tool_response = await service.respond_to_tool_call(
        workspace_id=run.workspace_id,
        actor_user_id=owner_user_id,
        tool_call_id="tool-call-resume-human",
        idempotency_key="tool-response-resume-human",
        payload=AgentHumanToolResultRequestV1(
            checkpoint_id="checkpoint-resume-human",
            kind="human_result",
            result={"audience": "design teams"},
        ),
    )
    assert tool_response.expected_sequence == 5

    now = datetime.now(UTC)
    dispatch = await JobDispatchOutboxRecord.get(job_id=job.id, dispatch_sequence=1)
    await JobDispatchOutboxRecord.filter(id=dispatch.id).update(
        status=JobDispatchStatus.DISPATCHED,
        dispatched_at=now,
        task_message_id="resume-interrupted-delivery",
    )
    await JobAttemptRecord.create(
        job_id=job.id,
        dispatch_id=dispatch.id,
        attempt_number=1,
        fencing_token=uuid4(),
        status=JobAttemptStatus.INTERRUPTED,
        worker_id="agent-resume-worker-1",
        handler_version=1,
        claimed_at=now - timedelta(minutes=1),
        lease_until=now,
        heartbeat_at=now,
        timeout_at=now + timedelta(minutes=5),
        started_at=now - timedelta(minutes=1),
        completed_at=now,
    )
    await BackgroundJobRecord.filter(id=job.id).update(
        internal_status=JobInternalStatus.WAITING_FOR_USER,
        attempt_count=1,
        phase="waiting_for_user",
        status_key="AI_AGENT_RUN_STATUS_WAITING_FOR_USER",
    )
    resume_payload = ResumeAgentRunRequestV1(
        response_id=tool_response.response_id,
        checkpoint_id="checkpoint-resume-human",
        expected_sequence=5,
        idempotency_key="resume-human-command",
    )

    resumed = await service.resume_run(
        workspace_id=run.workspace_id,
        actor_user_id=owner_user_id,
        run_id=run.id,
        payload=resume_payload,
    )
    replayed = await service.resume_run(
        workspace_id=run.workspace_id,
        actor_user_id=owner_user_id,
        run_id=run.id,
        payload=resume_payload,
    )

    assert resumed == replayed
    assert resumed.status == "running"
    assert resumed.last_sequence == 6
    refreshed_run = await AgentRunV1Record.get(id=run.id)
    refreshed_job = await BackgroundJobRecord.get(id=job.id)
    response = await AgentToolResponseV1Record.get(response_id=encode_uuid(tool_response.response_id))
    assert refreshed_run.status == AgentRunStatusV1.RUNNING
    assert refreshed_run.checkpoint_id is None
    assert response.consumed_at is not None
    assert refreshed_job.internal_status == JobInternalStatus.PENDING_DISPATCH
    assert await JobDispatchOutboxRecord.filter(job_id=job.id).count() == 2
    retry_dispatch = await JobDispatchOutboxRecord.get(job_id=job.id, dispatch_sequence=2)
    assert retry_dispatch.status == JobDispatchStatus.PENDING
    assert await AgentRunEventV1Record.filter(run_id=run.id, type="run.resumed").count() == 1
