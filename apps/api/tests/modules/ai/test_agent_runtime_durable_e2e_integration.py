from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from redis.asyncio import Redis
from taskiq.acks import AcknowledgeType

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.llm.runtime import LLMRequestContext
from src.models.agents.runtime_v1 import AgentRunEventV1Record, AgentRunStatusV1, AgentRunV1Record
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobDispatchOutboxRecord,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.ai.service import AIChatService
from src.modules.jobs.schema import JobDispatchEnvelope, JobDispatchPolicy
from src.platform.jobs.composition.producer import build_producer_runtime, dispatch_once
from src.platform.jobs.durable.ack import DurableAckReceiver
from src.platform.jobs.workers.factory import build_workload_worker_runtime
from src.settings.runtime import invalidate_core_settings_cache
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration

_RECEIVER_TIMEOUT_SECONDS = 15


async def _consume_one(worker_broker) -> None:  # type: ignore[no-untyped-def]
    receiver = DurableAckReceiver(
        worker_broker,
        run_startup=False,
        ack_type=AcknowledgeType.WHEN_SAVED,
        max_async_tasks=1,
        max_prefetch=1,
        max_tasks_to_execute=1,
        wait_tasks_timeout=10,
    )
    await asyncio.wait_for(
        receiver.listen(asyncio.Event()),
        timeout=_RECEIVER_TIMEOUT_SECONDS,
    )


@pytest.mark.asyncio
async def test_agent_run_dispatches_through_real_agent_io_worker_and_acks_duplicate_delivery(
    prepared_db,
    integration_valkey_settings: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stream_token = uuid4().hex
    monkeypatch.setenv("TASKIQ__ENABLED", "true")
    monkeypatch.setenv(
        "TASKIQ__STREAM_PREFIX",
        f"{integration_valkey_settings}:agent-e2e:{stream_token}",
    )
    monkeypatch.setenv(
        "TASKIQ__CONSUMER_GROUP_PREFIX",
        f"{integration_valkey_settings}:agent-e2e-workers:{stream_token}",
    )
    get_settings.cache_clear()
    invalidate_core_settings_cache()

    calls: list[tuple[list[dict[str, str]], LLMRequestContext, str | None]] = []

    async def controlled_chat(
        _service: AIChatService,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        provider_params: dict[str, object] | None = None,
    ) -> JsonObject:
        _ = provider_params
        calls.append((messages, context, model))
        return {
            "id": "agent-e2e-completion",
            "model": model or "controlled-agent-model",
            "content": "A production-routed homepage plan.",
            "tool_calls": [],
            "usage": {"prompt_tokens": 14, "completion_tokens": 6},
            "finish_reason": "stop",
        }

    monkeypatch.setattr(AIChatService, "chat", controlled_chat)
    settings = get_settings()
    producer = build_producer_runtime(
        settings=settings,
        producer_identity=f"agent-e2e-producer:{stream_token}",
    )
    worker = build_workload_worker_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.AGENT_IO,
        consumer_identity=f"agent-e2e-worker:{stream_token}",
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
            catalog = catalog_response.json()["data"]
            lead_agent_id = catalog["defaultAgentId"]
            mentioned_agent_id = next(item["agentId"] for item in catalog["agents"] if item["slug"] == "data-analyst")

            thread_response = await client.post(
                f"/api/v1/workspaces/{workspace_public_id}/ai/threads",
                headers={"Idempotency-Key": f"agent-e2e-thread-{stream_token}"},
                json={
                    "projectId": project_public_id,
                    "leadAgentId": lead_agent_id,
                    "title": "Agent durable E2E",
                },
            )
            assert thread_response.status_code == 201, thread_response.text
            thread_public_id = thread_response.json()["data"]["threadId"]

            run_response = await client.post(
                f"/api/v1/workspaces/{workspace_public_id}/ai/threads/{thread_public_id}/runs",
                headers={"Idempotency-Key": f"agent-e2e-{stream_token}"},
                json={
                    "projectId": project_public_id,
                    "leadAgentId": lead_agent_id,
                    "mentionedAgentIds": [mentioned_agent_id],
                    "executionMode": "plan",
                    "message": "Plan a launch-ready homepage.",
                },
            )
            assert run_response.status_code == 202, run_response.text
            assert run_response.json()["data"]["status"] == "queued"
            run_uuid = decode_public_id(run_response.json()["data"]["runId"])

            run = await AgentRunV1Record.get(id=run_uuid)
            job = await BackgroundJobRecord.get(id=run.job_id)
            dispatch = await JobDispatchOutboxRecord.get(job_id=job.id)
            envelope = JobDispatchEnvelope.model_validate(dispatch.envelope)
            assert envelope.workload_class == JobWorkloadClass.AGENT_IO
            assert envelope.target_descriptor == {
                "workspaceId": workspace_public_id,
            }

            assert (
                await dispatch_once(
                    runtime=producer,
                    dispatcher_id=f"agent-e2e-dispatcher:{stream_token}",
                    policy=dispatch_policy,
                    limit=1,
                )
                == 1
            )
            await _consume_one(worker.broker)

            completed_job = await BackgroundJobRecord.get(id=job.id)
            completed_run = await AgentRunV1Record.get(id=run_uuid)
            attempt_count = await JobAttemptRecord.filter(job_id=job.id).count()
            events = await AgentRunEventV1Record.filter(run_id=run_uuid).order_by("sequence")
            assert completed_job.internal_status == JobInternalStatus.SUCCEEDED
            assert completed_run.status == AgentRunStatusV1.COMPLETED
            assert attempt_count == 1
            assert len(calls) == 1
            assert calls[0][1].agent_run_id == run_uuid
            assert calls[0][1].workspace_id == decode_public_id(workspace_public_id)
            assert [event.type for event in events] == [
                "run.created",
                "run.queued",
                "run.started",
                "message.part.started",
                "message.part.delta",
                "message.part.completed",
                "usage.updated",
                "run.completed",
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

            snapshot = await client.get(run_response.json()["data"]["snapshotUrl"])
            assert snapshot.status_code == 200, snapshot.text
            assert snapshot.json()["data"]["run"]["status"] == "completed"
            assert snapshot.json()["data"]["terminal"] is True

            await producer.transport.dispatch(
                task_name=dispatch.task_name,
                envelope=envelope,
            )
            await _consume_one(worker.broker)

            replayed_job = await BackgroundJobRecord.get(id=job.id)
            replayed_run = await AgentRunV1Record.get(id=run_uuid)
            assert replayed_job.internal_status == JobInternalStatus.SUCCEEDED
            assert replayed_job.completed_at == completed_job.completed_at
            assert replayed_run.last_sequence == completed_run.last_sequence
            assert await JobAttemptRecord.filter(job_id=job.id).count() == attempt_count
            assert len(calls) == 1
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
