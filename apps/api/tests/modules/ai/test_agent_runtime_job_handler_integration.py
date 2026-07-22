from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.config import get_settings
from src.core.events import Event
from src.llm.runtime import LLMRequestContext, LLMRuntimeError
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentRunEventV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
)
from src.models.jobs.background_job import BackgroundJobRecord, JobInternalStatus, JobWorkloadClass
from src.models.organization.organization import Organization, OrganizationKind
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_manifest import official_agent_id
from src.modules.ai.agent_skill_grant_schema import (
    AgentSkillContextPackage,
    AgentSkillContextResource,
)
from src.modules.ai.agent_skill_grant_service import AgentSkillGrantError, AgentSkillGrantResolver
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalOptionV1,
    ApprovalRiskV1,
    ApprovalV1,
)
from src.modules.ai.runtime_execution_gateway import (
    AgentRunExecutionInterrupted,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
    SingleTurnAgentRunExecutionGateway,
)
from src.modules.ai.runtime_job_handler import AgentRunJobHandler
from src.modules.ai.runtime_job_schema import AgentRunJobInput, AgentRunJobResult, AgentRunJobTarget
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1
from src.modules.ai.runtime_run_service import AgentRunService
from src.modules.ai.runtime_thread_schema import AgentThreadCreateRequestV1
from src.modules.ai.runtime_thread_service import AgentThreadService
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import (
    JobExecutionContext,
    JobHandledFailure,
    JobHandledInterruption,
)
from src.modules.jobs.execution_schema import (
    JobExecutionControlSnapshot,
    JobExecutionLease,
    JobProgressUpdate,
)
from src.modules.jobs.service import BackgroundJobService
from tests.modules.ai.runtime_design_system_test_context import fixed_design_system_context_resolver

pytestmark = pytest.mark.integration


class _EventPublisher:
    async def publish(self, event: Event) -> None:
        _ = event


class _ChatService:
    def __init__(self, *, error: LLMRuntimeError | None = None) -> None:
        self.error = error
        self.calls: list[tuple[list[dict[str, str]], LLMRequestContext, str | None]] = []

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        provider_params: dict[str, object] | None = None,
    ) -> JsonObject:
        _ = provider_params
        self.calls.append((messages, context, model))
        if self.error is not None:
            raise self.error
        return {
            "id": "completion-1",
            "model": model or "gpt-4o-mini",
            "content": "A launch-ready homepage blueprint.",
            "usage": {"prompt_tokens": 12, "completion_tokens": 7},
            "finish_reason": "stop",
        }


class _InterruptedGateway:
    def __init__(self, *, outcome: AgentRunExecutionInterrupted) -> None:
        self.outcome = outcome
        self.requests: list[AgentRunExecutionRequest] = []

    async def execute(self, *, request: AgentRunExecutionRequest) -> AgentRunExecutionInterrupted:
        self.requests.append(request)
        return self.outcome

    async def resume(self, *, request: AgentRunResumeExecutionRequest) -> AgentRunExecutionInterrupted:
        _ = request
        raise AssertionError("interruption tests do not resume the graph")


class _SkillGrantResolver(AgentSkillGrantResolver):
    def __init__(
        self,
        *,
        packages: tuple[AgentSkillContextPackage, ...] = (),
        error_code: str | None = None,
    ) -> None:
        self.packages = packages
        self.error_code = error_code
        self.calls: list[tuple[UUID, UUID, tuple[object, ...]]] = []

    async def load_run_context(self, *, workspace_id, run_id, agents):  # type: ignore[no-untyped-def]
        self.calls.append((workspace_id, run_id, agents))
        if self.error_code is not None:
            raise AgentSkillGrantError(self.error_code)
        return self.packages


def _skill_context_package() -> AgentSkillContextPackage:
    return AgentSkillContextPackage(
        installation_id=UUID("11111111-1111-4111-8111-111111111111"),
        package_id=UUID("22222222-2222-4222-8222-222222222222"),
        skill_version_id=UUID("33333333-3333-4333-8333-333333333333"),
        package_checksum="sha256:" + ("a" * 64),
        name="Launch Planning Guardrails",
        instructions_entrypoint="SKILL.md",
        resources=(
            AgentSkillContextResource(
                path="SKILL.md",
                role="instructions",
                mime_type="text/markdown",
                digest="sha256:" + ("b" * 64),
                content="Use the approved launch sequence and cite every assumption.",
                byte_size=61,
            ),
            AgentSkillContextResource(
                path="references/checklist.md",
                role="reference",
                mime_type="text/markdown",
                digest="sha256:" + ("c" * 64),
                content="Confirm audience, structure, and launch evidence.",
                byte_size=49,
            ),
        ),
    )


class _JobContext(JobExecutionContext[AgentRunJobTarget, AgentRunJobInput]):
    def __init__(
        self,
        *,
        lease: JobExecutionLease,
        actor_user_id: UUID,
        target: AgentRunJobTarget,
        input_reference: AgentRunJobInput,
        cancellation_requested: bool = False,
    ) -> None:
        self._lease = lease
        self._actor_user_id = actor_user_id
        self._target = target
        self._input_reference = input_reference
        self._cancellation_requested = cancellation_requested
        self.progress: list[JobProgressUpdate] = []

    @property
    def lease(self) -> JobExecutionLease:
        return self._lease

    @property
    def actor_user_id(self) -> UUID:
        return self._actor_user_id

    @property
    def target(self) -> AgentRunJobTarget:
        return self._target

    @property
    def input_reference(self) -> AgentRunJobInput:
        return self._input_reference

    @property
    def source_revision(self) -> str | None:
        return None

    @property
    def request_fingerprint(self) -> str:
        return "f" * 64

    def idempotency_key(self, *, step: str) -> str:
        return f"job-step:{step}"

    async def checkpoint(self) -> JobExecutionControlSnapshot:
        return self._control()

    async def report_progress(self, update: JobProgressUpdate) -> JobExecutionControlSnapshot:
        self.progress.append(update)
        return self._control()

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        return await operation()

    def _control(self) -> JobExecutionControlSnapshot:
        now = datetime.now(UTC)
        return JobExecutionControlSnapshot(
            job_id=self.lease.job_id,
            attempt_id=self.lease.attempt_id,
            fencing_token=self.lease.fencing_token,
            observed_at=now,
            lease_until=now + timedelta(minutes=2),
            cancel_requested_at=now if self._cancellation_requested else None,
            cancel_requested_by_user_id=(self.actor_user_id if self._cancellation_requested else None),
        )


async def _create_queued_run() -> tuple[AgentRunV1Record, BackgroundJobRecord, UUID]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-job-handler-org-{uuid4().hex[:10]}",
        name="Agent Job Handler Org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Job Handler Workspace",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-job-handler-project-{uuid4().hex[:10]}",
        name="Agent Job Handler Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    thread = await AgentThreadService(event_publisher=_EventPublisher()).create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="job-handler-thread",
        payload=AgentThreadCreateRequestV1(
            project_id=project.id,
            lead_agent_id=official_agent_id("arclayer-coordinator"),
            title="Homepage build",
        ),
    )
    response = await AgentRunService(
        job_service=BackgroundJobService(event_publisher=_EventPublisher()),
        event_publisher=_EventPublisher(),
        design_system_context_resolver=fixed_design_system_context_resolver(project.id),
    ).create(
        workspace_id=workspace.id,
        thread_id=thread.thread_id,
        owner_user_id=owner_user_id,
        idempotency_key=uuid4().hex,
        payload=AgentRunCreateRequestV1(
            project_id=project.id,
            lead_agent_id=official_agent_id("arclayer-coordinator"),
            execution_mode="build",
            message="Build a launch-ready homepage.",
        ),
    )
    run = await AgentRunV1Record.get(id=response.run_id)
    job = await BackgroundJobRecord.get(id=run.job_id)
    return run, job, owner_user_id


def _context(
    *,
    run: AgentRunV1Record,
    job: BackgroundJobRecord,
    owner_user_id: UUID,
    cancellation_requested: bool = False,
) -> _JobContext:
    now = datetime.now(UTC)
    return _JobContext(
        lease=JobExecutionLease(
            job_id=job.id,
            attempt_id=uuid4(),
            dispatch_sequence=1,
            attempt_number=1,
            worker_id="agent-worker-1",
            fencing_token=uuid4(),
            job_type=job.job_type,
            job_type_version=job.job_type_version,
            workload_class=JobWorkloadClass.AGENT_IO,
            claimed_at=now,
            lease_until=now + timedelta(minutes=2),
        ),
        actor_user_id=owner_user_id,
        target=AgentRunJobTarget.model_validate(job.target_descriptor),
        input_reference=AgentRunJobInput.model_validate(job.input_reference),
        cancellation_requested=cancellation_requested,
    )


@pytest.mark.asyncio
async def test_agent_job_handler_projects_real_normalized_completion(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    chat = _ChatService()
    handler = AgentRunJobHandler(
        settings=get_settings(),
        execution_gateway=SingleTurnAgentRunExecutionGateway(chat_service=chat),
    )
    context = _context(run=run, job=job, owner_user_id=owner_user_id)

    assert await handler.reconcile(context=context) is None
    result = await handler.execute(context=context)
    replay = await handler.reconcile(context=context)

    assert isinstance(result, AgentRunJobResult)
    assert replay == result
    refreshed = await AgentRunV1Record.get(id=run.id)
    assert refreshed.status == AgentRunStatusV1.COMPLETED
    events = await AgentRunEventV1Record.filter(run_id=run.id).order_by("sequence")
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
    assert [event.sequence for event in events] == list(range(1, 9))
    assert [update.progress_completed for update in context.progress] == [0, 1, 2, 3]
    assert len(chat.calls) == 1
    assert chat.calls[0][1].agent_run_id == run.id
    system_prompt = chat.calls[0][0][0]["content"]
    assert "Exact Project Design System context" in system_prompt
    assert f'"contextHash":"sha256:{"4" * 64}"' in system_prompt
    assert '"renderer":"not_evaluated"' in system_prompt
    assert "Do not invent hidden literals" in system_prompt


@pytest.mark.asyncio
async def test_agent_job_handler_injects_exact_lead_skill_context_into_provider_request(
    prepared_db,
) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    chat = _ChatService()
    resolver = _SkillGrantResolver(packages=(_skill_context_package(),))
    handler = AgentRunJobHandler(
        settings=get_settings(),
        execution_gateway=SingleTurnAgentRunExecutionGateway(chat_service=chat),
        skill_grant_resolver_factory=lambda: resolver,
    )

    result = await handler.execute(context=_context(run=run, job=job, owner_user_id=owner_user_id))

    assert isinstance(result, AgentRunJobResult)
    assert len(resolver.calls) == 1
    assert resolver.calls[0][0:2] == (run.workspace_id, run.id)
    assert len(resolver.calls[0][2]) == 1
    system_prompt = chat.calls[0][0][0]["content"]
    assert "Untrusted Skill context policy" in system_prompt
    assert "11111111-1111-4111-8111-111111111111" in system_prompt
    assert "33333333-3333-4333-8333-333333333333" in system_prompt
    assert "sha256:" + ("a" * 64) in system_prompt
    assert '"path":"SKILL.md"' in system_prompt
    assert "Use the approved launch sequence and cite every assumption." in system_prompt
    assert '"path":"references/checklist.md"' in system_prompt
    assert "Confirm audience, structure, and launch evidence." in system_prompt


@pytest.mark.asyncio
async def test_agent_job_handler_rejects_invalid_skill_snapshot_as_permanent_failure(
    prepared_db,
) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    resolver = _SkillGrantResolver(error_code="AGENT_SKILL_SNAPSHOT_INVALID")
    handler = AgentRunJobHandler(
        settings=get_settings(),
        execution_gateway=SingleTurnAgentRunExecutionGateway(chat_service=_ChatService()),
        skill_grant_resolver_factory=lambda: resolver,
    )

    with pytest.raises(PermanentJobExecutionError) as rejected:
        await handler.execute(context=_context(run=run, job=job, owner_user_id=owner_user_id))

    assert rejected.value.code == "AGENT_RUN_EXECUTION_FAILED"
    assert rejected.value.metadata == {"publicErrorCode": "AGENT_SKILL_SNAPSHOT_INVALID"}


@pytest.mark.asyncio
async def test_agent_job_handler_projects_provider_failure_without_fake_success(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    handler = AgentRunJobHandler(
        settings=get_settings(),
        execution_gateway=SingleTurnAgentRunExecutionGateway(
            chat_service=_ChatService(
                error=LLMRuntimeError(
                    code="PROVIDER_UNAVAILABLE",
                    message="Provider unavailable",
                    status_code=503,
                )
            ),
        ),
    )
    context = _context(run=run, job=job, owner_user_id=owner_user_id)

    result = await handler.execute(context=context)
    replay = await handler.reconcile(context=context)

    assert isinstance(result, JobHandledFailure)
    assert replay == result
    refreshed = await AgentRunV1Record.get(id=run.id)
    assert refreshed.status == AgentRunStatusV1.FAILED
    assert refreshed.error["code"] == "PROVIDER_UNAVAILABLE"
    assert await AgentRunEventV1Record.filter(run_id=run.id, type="run.failed").exists()


@pytest.mark.asyncio
async def test_agent_job_handler_projects_human_interrupt_as_durable_continuation(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    gateway = _InterruptedGateway(
        outcome=AgentRunExecutionInterrupted(
            interrupt_id="interrupt-audience-1",
            checkpoint_id="checkpoint-audience-1",
            reason="human_tool_input",
            tool_call_id="tool-call-audience-1",
            tool_id="human.request_input",
            tool_version="1",
            tool_name="human.request_input",
            args={"questionKey": "agents.questions.chooseAudience"},
        )
    )
    handler = AgentRunJobHandler(settings=get_settings(), execution_gateway=gateway)
    context = _context(run=run, job=job, owner_user_id=owner_user_id)

    result = await handler.execute(context=context)
    replay = await handler.reconcile(context=context)

    assert isinstance(result, JobHandledInterruption)
    assert replay == result
    assert result.continuation_reference == {
        "runId": str(run.id),
        "interruptId": "interrupt-audience-1",
        "checkpointId": "checkpoint-audience-1",
        "reason": "human_tool_input",
        "toolCallId": "tool-call-audience-1",
        "approvalId": None,
    }
    refreshed = await AgentRunV1Record.get(id=run.id)
    assert refreshed.status == AgentRunStatusV1.INTERRUPTED
    assert refreshed.checkpoint_id == "checkpoint-audience-1"
    events = await AgentRunEventV1Record.filter(run_id=run.id).order_by("sequence")
    assert [event.type for event in events] == [
        "run.created",
        "run.queued",
        "run.started",
        "message.part.started",
        "tool.started",
        "run.interrupted",
    ]
    assert events[3].payload["data"]["part"]["toolName"] == "human.request_input"
    assert len(gateway.requests) == 1


@pytest.mark.asyncio
async def test_agent_job_handler_projects_approval_and_interrupt_atomically(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    requested_at = datetime.now(UTC)
    approval = ApprovalV1(
        approval_id="approval-publish-1",
        approval_version=1,
        tool_call_id="tool-call-publish-1",
        checkpoint_id="checkpoint-publish-1",
        status="pending",
        requested_at=requested_at,
        expires_at=requested_at + timedelta(hours=1),
        policy_version="agent-policy-v1",
        risk=ApprovalRiskV1(
            side_effect_class="publish",
            summary_key="agents.approval.publish.summary",
            summary_params={"target": "production"},
            preview_ref="preview-publish-1",
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
        ),
    )
    gateway = _InterruptedGateway(
        outcome=AgentRunExecutionInterrupted(
            interrupt_id="interrupt-publish-1",
            checkpoint_id="checkpoint-publish-1",
            reason="approval_required",
            tool_call_id="tool-call-publish-1",
            tool_id="site.publish",
            tool_version="1",
            tool_name="site.publish",
            args={"target": "production"},
            approval=approval,
        )
    )
    handler = AgentRunJobHandler(settings=get_settings(), execution_gateway=gateway)
    context = _context(run=run, job=job, owner_user_id=owner_user_id)

    result = await handler.execute(context=context)

    assert isinstance(result, JobHandledInterruption)
    events = await AgentRunEventV1Record.filter(run_id=run.id).order_by("sequence")
    assert [event.type for event in events] == [
        "run.created",
        "run.queued",
        "run.started",
        "message.part.started",
        "approval.required",
        "run.interrupted",
    ]
    refreshed = await AgentRunV1Record.get(id=run.id)
    assert refreshed.status == AgentRunStatusV1.INTERRUPTED
    assert refreshed.interrupt_approval_id == approval.approval_id


@pytest.mark.asyncio
async def test_interrupted_agent_run_cancel_terminalizes_waiting_job_without_worker(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    gateway = _InterruptedGateway(
        outcome=AgentRunExecutionInterrupted(
            interrupt_id="interrupt-cancel-1",
            checkpoint_id="checkpoint-cancel-1",
            reason="human_tool_input",
            tool_call_id="tool-call-cancel-1",
            tool_id="human.request_input",
            tool_version="1",
            tool_name="human.request_input",
            args={"questionKey": "agents.questions.confirmScope"},
        )
    )
    handler = AgentRunJobHandler(settings=get_settings(), execution_gateway=gateway)
    await handler.execute(context=_context(run=run, job=job, owner_user_id=owner_user_id))
    job.internal_status = JobInternalStatus.WAITING_FOR_USER
    job.continuation_reference = {"checkpointId": "checkpoint-cancel-1"}
    await job.save(update_fields=["internal_status", "continuation_reference", "updated_at"])

    snapshot = await AgentRunService(event_publisher=_EventPublisher()).cancel(
        workspace_id=run.workspace_id,
        owner_user_id=owner_user_id,
        run_id=run.id,
    )

    cancelled_run = await AgentRunV1Record.get(id=run.id)
    cancelled_job = await BackgroundJobRecord.get(id=job.id)
    assert snapshot.run.status == AgentRunStatusV1.CANCELLED
    assert cancelled_run.status == AgentRunStatusV1.CANCELLED
    assert cancelled_job.internal_status == JobInternalStatus.CANCELLED
    assert cancelled_job.cancellation_acknowledged_at is not None
    assert cancelled_job.continuation_reference is None


@pytest.mark.asyncio
async def test_approval_interrupted_run_cancel_recovers_terminal_job_and_closes_approval(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    requested_at = datetime.now(UTC)
    approval = ApprovalV1(
        approval_id="approval-terminal-job-1",
        approval_version=1,
        tool_call_id="tool-call-terminal-job-1",
        checkpoint_id="checkpoint-terminal-job-1",
        status="pending",
        requested_at=requested_at,
        expires_at=requested_at + timedelta(hours=1),
        policy_version="agent-policy-v1",
        risk=ApprovalRiskV1(
            side_effect_class="draft_write",
            summary_key="agents.approval.styleGuide.summary",
            summary_params={"stage": "style_guide"},
            preview_ref=None,
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
        ),
    )
    gateway = _InterruptedGateway(
        outcome=AgentRunExecutionInterrupted(
            interrupt_id="interrupt-terminal-job-1",
            checkpoint_id=approval.checkpoint_id,
            reason="approval_required",
            tool_call_id=approval.tool_call_id,
            tool_id="builder.style_guide.generate",
            tool_version="1",
            tool_name="builder.style_guide.generate",
            args={"candidateCount": 2},
            approval=approval,
        )
    )
    handler = AgentRunJobHandler(settings=get_settings(), execution_gateway=gateway)
    await handler.execute(context=_context(run=run, job=job, owner_user_id=owner_user_id))
    job.internal_status = JobInternalStatus.SUCCEEDED
    job.completed_at = datetime.now(UTC)
    await job.save(update_fields=["internal_status", "completed_at", "updated_at"])

    snapshot = await AgentRunService(event_publisher=_EventPublisher()).cancel(
        workspace_id=run.workspace_id,
        owner_user_id=owner_user_id,
        run_id=run.id,
    )

    persisted_approval = await AgentApprovalV1Record.get(approval_id=approval.approval_id)
    events = await AgentRunEventV1Record.filter(run_id=run.id).order_by("sequence")
    assert snapshot.run.status == AgentRunStatusV1.CANCELLED
    assert snapshot.pending_approvals == ()
    assert persisted_approval.status == AgentApprovalStatusV1.CANCELLED
    assert [event.type for event in events][-3:] == [
        "run.cancel.requested",
        "approval.resolved",
        "run.cancelled",
    ]


@pytest.mark.asyncio
async def test_agent_job_handler_cancellation_records_request_then_terminal(prepared_db) -> None:
    _ = prepared_db
    run, job, owner_user_id = await _create_queued_run()
    handler = AgentRunJobHandler(
        settings=get_settings(),
        execution_gateway=SingleTurnAgentRunExecutionGateway(chat_service=_ChatService()),
    )
    context = _context(
        run=run,
        job=job,
        owner_user_id=owner_user_id,
        cancellation_requested=True,
    )

    await handler.cancel(context=context)

    refreshed = await AgentRunV1Record.get(id=run.id)
    assert refreshed.status == AgentRunStatusV1.CANCELLED
    events = await AgentRunEventV1Record.filter(run_id=run.id).order_by("sequence")
    assert [event.type for event in events] == [
        "run.created",
        "run.queued",
        "run.cancel.requested",
        "run.cancelled",
    ]
