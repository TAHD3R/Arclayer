from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from redis.asyncio import Redis

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.models.agents.runtime_v1 import AgentRunEventV1Record, AgentRunStatusV1, AgentRunV1Record
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalOptionV1,
    ApprovalRiskV1,
    ApprovalV1,
)
from src.modules.ai.runtime_execution_gateway import (
    AgentRunChatUsage,
    AgentRunExecutionCompleted,
    AgentRunExecutionInterrupted,
    AgentRunExecutionRejected,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
    AgentRunToolCompletion,
)
from src.modules.ai.runtime_model_step_gateway import ModelToolAgentRunExecutionGateway
from src.modules.jobs.schema import JobDispatchPolicy
from src.platform.jobs.composition.producer import build_producer_runtime, dispatch_once
from src.platform.jobs.workers.factory import build_workload_worker_runtime
from src.settings.runtime import invalidate_core_settings_cache
from tests.modules.ai.test_agent_runtime_durable_e2e_integration import _consume_one
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
@pytest.mark.parametrize("response_kind", ["human_result", "approval", "approval_denied"])
async def test_agent_worker_interrupts_and_resumes_same_langgraph_checkpoint(
    prepared_db,
    integration_valkey_settings: str,
    monkeypatch: pytest.MonkeyPatch,
    response_kind: str,
) -> None:
    stream_token = uuid4().hex
    monkeypatch.setenv("TASKIQ__ENABLED", "true")
    monkeypatch.setenv("LANGGRAPH_STRICT_MSGPACK", "true")
    monkeypatch.setenv("TASKIQ__STREAM_PREFIX", f"{integration_valkey_settings}:agent-resume:{stream_token}")
    monkeypatch.setenv(
        "TASKIQ__CONSUMER_GROUP_PREFIX",
        f"{integration_valkey_settings}:agent-resume-workers:{stream_token}",
    )
    get_settings.cache_clear()
    invalidate_core_settings_cache()
    execute_requests: list[AgentRunExecutionRequest] = []
    resume_requests: list[AgentRunResumeExecutionRequest] = []

    async def controlled_execute(
        _gateway: ModelToolAgentRunExecutionGateway,
        *,
        request: AgentRunExecutionRequest,
    ) -> AgentRunExecutionInterrupted:
        execute_requests.append(request)
        if response_kind != "human_result":
            requested_at = datetime.now(UTC)
            approval = ApprovalV1(
                approval_id="approval-publish-e2e",
                approval_version=1,
                tool_call_id="tool-call-publish-e2e",
                checkpoint_id="placeholder-checkpoint",
                status="pending",
                requested_at=requested_at,
                expires_at=requested_at + timedelta(hours=1),
                policy_version="site-publish-policy-v1",
                risk=ApprovalRiskV1(
                    side_effect_class="publish",
                    summary_key="agents.approval.publish.summary",
                    summary_params={"target": "production"},
                    preview_ref="preview-publish-e2e",
                ),
                options=(
                    ApprovalOptionV1(
                        id="allow_once",
                        kind="allow-once",
                        label_key="agents.approval.allowOnce",
                        description_key="agents.approval.allowOnceDescription",
                        grants=(),
                        confirm=True,
                    ),
                    ApprovalOptionV1(
                        id="reject_once",
                        kind="reject-once",
                        label_key="agents.approval.rejectOnce",
                        description_key="agents.approval.rejectOnceDescription",
                        grants=(),
                        confirm=True,
                    ),
                ),
            )
            return AgentRunExecutionInterrupted(
                interrupt_id="placeholder-interrupt",
                checkpoint_id="placeholder-checkpoint",
                reason="approval_required",
                tool_call_id="tool-call-publish-e2e",
                tool_id="site.publish",
                tool_version="1",
                tool_name="site.publish",
                args={"target": "production"},
                approval=approval,
            )
        return AgentRunExecutionInterrupted(
            interrupt_id="placeholder-interrupt",
            checkpoint_id="placeholder-checkpoint",
            reason="human_tool_input",
            tool_call_id="tool-call-audience-e2e",
            tool_id="human.request_input",
            tool_version="1",
            tool_name="human.request_input",
            args={"questionKey": "agents.questions.chooseAudience"},
        )

    async def controlled_resume(
        _gateway: ModelToolAgentRunExecutionGateway,
        *,
        request: AgentRunResumeExecutionRequest,
    ) -> AgentRunExecutionCompleted | AgentRunExecutionRejected:
        resume_requests.append(request)
        interrupted = request.interrupted
        tool_completion = None
        if response_kind == "approval_denied":
            return AgentRunExecutionRejected(
                error_code="AGENT_TOOL_APPROVAL_REJECTED",
                message="The requested Tool action was rejected.",
            )
        if response_kind == "approval":
            assert interrupted is not None
            tool_completion = AgentRunToolCompletion(
                tool_call_id=interrupted.tool_call_id,
                tool_id=interrupted.tool_id,
                tool_version=interrupted.tool_version,
                tool_name=interrupted.tool_name,
                args=interrupted.args,
                result={"published": True, "releaseId": "release-e2e-1"},
            )
        return AgentRunExecutionCompleted(
            completion_id="agent-resume-e2e-completion",
            model=request.model or "controlled-agent-model",
            content="The homepage is now planned for design teams.",
            usage=AgentRunChatUsage(prompt_tokens=18, completion_tokens=9),
            finish_reason="stop",
            tool_completion=tool_completion,
        )

    monkeypatch.setattr(ModelToolAgentRunExecutionGateway, "execute", controlled_execute)
    monkeypatch.setattr(ModelToolAgentRunExecutionGateway, "resume", controlled_resume)
    settings = get_settings()
    producer = build_producer_runtime(
        settings=settings,
        producer_identity=f"agent-resume-producer:{stream_token}",
    )
    worker = build_workload_worker_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.AGENT_IO,
        consumer_identity=f"agent-resume-worker:{stream_token}",
    )
    producer_broker = producer.brokers.select(JobWorkloadClass.AGENT_IO)
    redis = Redis.from_url(settings.taskiq.redis_dsn or settings.valkey.dsn)
    stream_name = worker.broker.queue_name
    dispatch_policy = JobDispatchPolicy(
        lease_seconds=settings.background_jobs.dispatcher.lease_seconds,
        max_attempts=settings.background_jobs.dispatcher.max_attempts,
        retry_delay_seconds=settings.background_jobs.dispatcher.retry_delay_seconds,
    )

    await redis.delete(stream_name)
    await producer_broker.startup()
    await worker.broker.startup()
    try:
        async with _workspace_client(prepared_db, integration_valkey_settings) as (
            client,
            workspace_public_id,
            project_public_id,
        ):
            catalog_response = await client.get(
                f"/api/v1/workspaces/{workspace_public_id}/agents",
                params={"projectId": project_public_id},
            )
            assert catalog_response.status_code == 200, catalog_response.text
            lead_agent_id = catalog_response.json()["data"]["defaultAgentId"]

            thread_response = await client.post(
                f"/api/v1/workspaces/{workspace_public_id}/ai/threads",
                headers={"Idempotency-Key": f"agent-resume-thread-{stream_token}"},
                json={
                    "projectId": project_public_id,
                    "leadAgentId": lead_agent_id,
                    "title": "Agent interrupt resume E2E",
                },
            )
            assert thread_response.status_code == 201, thread_response.text
            thread_public_id = thread_response.json()["data"]["threadId"]
            run_response = await client.post(
                f"/api/v1/workspaces/{workspace_public_id}/ai/threads/{thread_public_id}/runs",
                headers={"Idempotency-Key": f"agent-resume-{stream_token}"},
                json={
                    "projectId": project_public_id,
                    "leadAgentId": lead_agent_id,
                    "executionMode": "build",
                    "message": "Build a homepage and ask which audience it should serve.",
                },
            )
            assert run_response.status_code == 202, run_response.text
            run_uuid = decode_public_id(run_response.json()["data"]["runId"])
            run = await AgentRunV1Record.get(id=run_uuid)
            job = await BackgroundJobRecord.get(id=run.job_id)

            assert (
                await dispatch_once(
                    runtime=producer,
                    dispatcher_id=f"agent-resume-dispatcher-1:{stream_token}",
                    policy=dispatch_policy,
                    limit=1,
                )
                == 1
            )
            await _consume_one(worker.broker)

            interrupted_run = await AgentRunV1Record.get(id=run_uuid)
            waiting_job = await BackgroundJobRecord.get(id=job.id)
            first_attempt = await JobAttemptRecord.get(job_id=job.id, attempt_number=1)
            assert interrupted_run.status == AgentRunStatusV1.INTERRUPTED
            assert waiting_job.internal_status == JobInternalStatus.WAITING_FOR_USER
            assert first_attempt.status == JobAttemptStatus.INTERRUPTED
            assert waiting_job.completed_at is None
            assert waiting_job.continuation_reference["checkpointId"] == interrupted_run.checkpoint_id
            assert len(execute_requests) == 1

            response_payload = {
                "checkpointId": interrupted_run.checkpoint_id,
            }
            if response_kind != "human_result":
                approved = response_kind == "approval"
                response_payload.update({
                    "kind": "approval",
                    "approvalId": interrupted_run.interrupt_approval_id,
                    "approvalVersion": 1,
                    "approved": approved,
                    "optionId": "allow_once" if approved else "reject_once",
                    "reason": ("Publish the reviewed release." if approved else "Do not publish this release."),
                })
            else:
                response_payload.update({
                    "kind": "human_result",
                    "result": {"audience": "design teams"},
                })
            response = await client.post(
                f"/api/v1/workspaces/{workspace_public_id}/ai/tool-calls/{interrupted_run.interrupt_tool_call_id}/responses",
                headers={"Idempotency-Key": f"tool-response-{response_kind}-{stream_token}"},
                json=response_payload,
            )
            assert response.status_code == 200, response.text
            response_data = response.json()["data"]
            resumed = await client.post(
                f"/api/v1/workspaces/{workspace_public_id}/ai/runs/{encode_uuid(run_uuid)}/resume",
                json={
                    "responseId": response_data["responseId"],
                    "checkpointId": interrupted_run.checkpoint_id,
                    "expectedSequence": response_data["expectedSequence"],
                    "idempotencyKey": f"run-resume-{stream_token}",
                },
            )
            assert resumed.status_code == 200, resumed.text
            pending_job = await BackgroundJobRecord.get(id=job.id)
            assert pending_job.internal_status == JobInternalStatus.PENDING_DISPATCH
            assert pending_job.continuation_reference is None

            assert (
                await dispatch_once(
                    runtime=producer,
                    dispatcher_id=f"agent-resume-dispatcher-2:{stream_token}",
                    policy=dispatch_policy,
                    limit=1,
                )
                == 1
            )
            await _consume_one(worker.broker)

            completed_run = await AgentRunV1Record.get(id=run_uuid)
            completed_job = await BackgroundJobRecord.get(id=job.id)
            second_attempt = await JobAttemptRecord.get(job_id=job.id, attempt_number=2)
            events = await AgentRunEventV1Record.filter(run_id=run_uuid).order_by("sequence")
            if response_kind == "approval_denied":
                assert completed_run.status == AgentRunStatusV1.FAILED
                assert completed_job.internal_status == JobInternalStatus.FAILED
                assert second_attempt.status == JobAttemptStatus.FAILED
            else:
                assert completed_run.status == AgentRunStatusV1.COMPLETED
                assert completed_job.internal_status == JobInternalStatus.SUCCEEDED
                assert second_attempt.status == JobAttemptStatus.SUCCEEDED
            assert len(resume_requests) == 1
            assert resume_requests[0].interrupted is not None
            assert resume_requests[0].interrupted.interrupt_id == interrupted_run.interrupt_id
            assert resume_requests[0].interrupted.checkpoint_id == interrupted_run.checkpoint_id
            assert resume_requests[0].checkpoint_id == interrupted_run.checkpoint_id
            expected_resume = (
                {
                    "approved": True,
                    "optionId": "allow_once",
                    "reason": "Publish the reviewed release.",
                }
                if response_kind == "approval"
                else {
                    "approved": False,
                    "optionId": "reject_once",
                    "reason": "Do not publish this release.",
                }
                if response_kind == "approval_denied"
                else {"result": {"audience": "design teams"}}
            )
            assert resume_requests[0].resume == expected_resume
            common_prefix = [
                "run.created",
                "run.queued",
                "run.started",
                "message.part.started",
            ]
            if response_kind != "human_result":
                interrupt_events = ["approval.required", "run.interrupted", "approval.resolved"]
                resumed_tool_events = (
                    ["run.failed"]
                    if response_kind == "approval_denied"
                    else [
                        "tool.started",
                        "tool.completed",
                        "message.part.completed",
                        "message.part.started",
                        "message.part.delta",
                        "message.part.completed",
                        "usage.updated",
                        "run.completed",
                    ]
                )
            else:
                interrupt_events = ["tool.started", "run.interrupted"]
                resumed_tool_events = [
                    "tool.completed",
                    "message.part.completed",
                    "message.part.started",
                    "message.part.delta",
                    "message.part.completed",
                    "usage.updated",
                    "run.completed",
                ]
            assert [event.type for event in events] == [
                *common_prefix,
                *interrupt_events,
                "run.resumed",
                "run.started",
                *resumed_tool_events,
            ]
            assert (
                await redis.xpending_range(
                    stream_name,
                    worker.broker.consumer_group_name,
                    "-",
                    "+",
                    10,
                )
                == []
            )
    finally:
        await worker.broker.shutdown()
        await producer_broker.shutdown()
        await redis.delete(stream_name)
        await redis.aclose()
        get_settings.cache_clear()
        invalidate_core_settings_cache()
