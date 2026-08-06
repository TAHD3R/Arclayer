from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import NoReturn
from uuid import UUID, uuid4

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.llm.policy import RuntimeAiPolicyResolver, require_tool_allowed, resolve_runtime_policy
from src.llm.runtime import LLMRuntimeError
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalResolvedDataV1,
    ApprovalResolvedEventV1,
    RunResumedDataV1,
    RunResumedEventV1,
)
from src.modules.ai.runtime_command_repository import (
    AgentRunResumeState,
    AgentRuntimeCommandRepository,
    AgentToolCallCommandScope,
)
from src.modules.ai.runtime_command_schema import (
    AgentApprovalResponseRequestV1,
    AgentHumanToolResultRequestV1,
    AgentRunCommandResponseV1,
    AgentToolResponseRequestV1,
    AgentToolResponseV1,
    ResumeAgentRunRequestV1,
)
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_tool_response_schema import (
    ApprovalToolResponseCommandV1,
    HumanToolResultResponseCommandV1,
    PersistedAgentToolResponseV1,
    ToolResponseCommandV1,
)
from src.modules.jobs.service import BackgroundJobService

_NOT_FOUND_ERRORS = frozenset({
    "AGENT_APPROVAL_NOT_FOUND",
    "AGENT_RUN_NOT_FOUND",
    "AGENT_TOOL_PART_NOT_FOUND",
    "AGENT_RUN_RESUME_RESPONSE_MISSING",
})
_CONFLICT_ERRORS = frozenset({
    "AGENT_APPROVAL_ALREADY_RESOLVED",
    "AGENT_TOOL_RESPONSE_IDEMPOTENCY_CONFLICT",
    "AGENT_TOOL_RESPONSE_ID_REUSED",
    "AGENT_TOOL_RESULT_ALREADY_RECORDED",
    "AGENT_RUN_RESUME_IDEMPOTENCY_CONFLICT",
    "AGENT_RUN_POLICY_TOOL_NOT_ALLOWED",
})
_BAD_REQUEST_ERRORS = frozenset({
    "AGENT_APPROVAL_CONTRACT_MISMATCH",
    "AGENT_APPROVAL_EXPIRED",
    "AGENT_APPROVAL_OPTION_INVALID",
    "AGENT_APPROVAL_OPTION_REQUIRED",
    "AGENT_APPROVAL_VERSION_CONFLICT",
    "AGENT_TOOL_RESULT_NOT_PENDING",
    "AGENT_RUN_NOT_INTERRUPTED",
    "AGENT_RUN_RESUME_CHECKPOINT_MISMATCH",
    "AGENT_RUN_RESUME_RESPONSE_CONSUMED",
    "AGENT_RUN_RESUME_SEQUENCE_CONFLICT",
})


class AgentRuntimeCommandService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        repository: AgentRuntimeCommandRepository | None = None,
        runtime_repository: AgentRuntimeRepository | None = None,
        job_service: BackgroundJobService | None = None,
        runtime_policy_resolver: RuntimeAiPolicyResolver = resolve_runtime_policy,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="agent_runtime_command")
        self._repository = repository or AgentRuntimeCommandRepository()
        self._runtime_repository = runtime_repository or AgentRuntimeRepository()
        self._job_service = job_service or BackgroundJobService(self.settings)
        self._runtime_policy_resolver = runtime_policy_resolver

    async def respond_to_tool_call(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        tool_call_id: str,
        idempotency_key: str,
        payload: AgentToolResponseRequestV1,
    ) -> AgentToolResponseV1:
        normalized_key = idempotency_key.strip()
        try:
            scope = await self._repository.resolve_owned_tool_call(
                workspace_id=workspace_id,
                owner_user_id=actor_user_id,
                tool_call_id=tool_call_id,
                checkpoint_id=payload.checkpoint_id,
            )
            existing = await self._repository.get_response_command_by_idempotency(
                run_id=scope.run_id,
                actor_user_id=actor_user_id,
                idempotency_key=normalized_key,
            )
            response_id = (
                existing.response_id
                if existing is not None
                else _tool_response_id(
                    run_id=scope.run_id,
                    actor_user_id=actor_user_id,
                    idempotency_key=normalized_key,
                )
            )
            responded_at = existing.responded_at if existing is not None else datetime.now(UTC)
            command = self._response_command(
                scope=scope,
                actor_user_id=actor_user_id,
                response_id=response_id,
                idempotency_key=normalized_key,
                responded_at=responded_at,
                payload=payload,
            )
            persisted = await self._persist_response(scope=scope, command=command, payload=payload)
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        return AgentToolResponseV1(
            response_id=decode_public_id(persisted.response_id),
            tool_call_id=persisted.tool_call_id,
            checkpoint_id=persisted.checkpoint_id,
            response_kind=persisted.kind,
            expected_sequence=persisted.expected_sequence,
        )

    async def resume_run(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        run_id: UUID,
        payload: ResumeAgentRunRequestV1,
    ) -> AgentRunCommandResponseV1:
        event_id, cursor = _resume_event_identity(run_id=run_id, idempotency_key=payload.idempotency_key)
        existing_event = await self._repository.get_resumed_event(event_id=event_id)
        resumed_job = None
        try:
            async with self.tx() as conn:
                state = await self._repository.get_resume_state_for_update(
                    workspace_id=workspace_id,
                    owner_user_id=actor_user_id,
                    run_id=run_id,
                    response_id=encode_uuid(payload.response_id),
                    conn=conn,
                )
                if existing_event is None:
                    existing_event = await self._repository.get_resumed_event(event_id=event_id, conn=conn)
                if existing_event is not None:
                    _validate_resume_replay(state=state, event=existing_event, payload=payload)
                    persisted_sequence = existing_event.sequence
                    persisted_cursor = existing_event.cursor
                else:
                    _validate_resume_request(state=state, payload=payload)
                    try:
                        require_tool_allowed(
                            await self._runtime_policy_resolver(),
                            state.response_tool_id,
                        )
                    except LLMRuntimeError as error:
                        raise AgentRuntimePersistenceError("AGENT_RUN_POLICY_TOOL_NOT_ALLOWED") from error
                    resumed_at = datetime.now(UTC)
                    event = RunResumedEventV1(
                        event_version=1,
                        event_id=event_id,
                        cursor=cursor,
                        run_id=str(state.run_id),
                        thread_id=str(state.thread_id),
                        sequence=state.last_sequence + 1,
                        occurred_at=resumed_at,
                        correlation_id=state.correlation_id,
                        span_id=f"run-resume:{uuid4().hex}",
                        parent_span_id=f"run-resume-parent:{uuid4().hex}",
                        type="run.resumed",
                        data=RunResumedDataV1(
                            interrupt_id=state.interrupt_id or "",
                            checkpoint_id=payload.checkpoint_id,
                            resumed_at=resumed_at,
                            resume_kind=state.response_kind,
                        ),
                    )
                    persisted = await self._runtime_repository.append_event_in_transaction(
                        event=event,
                        run_id=state.run_id,
                        conn=conn,
                    )
                    if state.job_id is None:
                        raise AgentRuntimePersistenceError("AGENT_RUN_JOB_SCOPE_INVALID")
                    resumed_job, _dispatch = await self._job_service.resume_waiting_job_in_transaction(
                        job_id=state.job_id,
                        actor_user_id=actor_user_id,
                        resumed_at=resumed_at,
                        conn=conn,
                    )
                    persisted_sequence = persisted.sequence
                    persisted_cursor = persisted.cursor
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        if resumed_job is not None:
            await self._job_service.publish_resumed_after_commit(job=resumed_job)
        return AgentRunCommandResponseV1(
            run_id=run_id,
            status="running",
            last_sequence=persisted_sequence,
            last_cursor=persisted_cursor,
        )

    async def _persist_response(
        self,
        *,
        scope: AgentToolCallCommandScope,
        command: ToolResponseCommandV1,
        payload: AgentToolResponseRequestV1,
    ) -> PersistedAgentToolResponseV1:
        if isinstance(payload, AgentHumanToolResultRequestV1):
            if not isinstance(command, HumanToolResultResponseCommandV1):
                raise AgentRuntimePersistenceError("AGENT_TOOL_RESPONSE_CONTRACT_MISMATCH")
            return await self._runtime_repository.record_human_tool_result(command=command)
        if not isinstance(command, ApprovalToolResponseCommandV1) or scope.approval is None:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_NOT_FOUND")
        event_id, cursor = _response_event_identity(command.response_id)
        event = await self._repository.get_approval_resolved_event(event_id=event_id)
        if event is None:
            resolved_status = "approved" if command.approved else "rejected"
            event = ApprovalResolvedEventV1(
                event_version=1,
                event_id=event_id,
                cursor=cursor,
                run_id=str(scope.run_id),
                thread_id=str(scope.thread_id),
                sequence=scope.last_sequence + 1,
                occurred_at=command.responded_at,
                correlation_id=scope.correlation_id,
                span_id=f"tool-response:{uuid4().hex}",
                parent_span_id=f"tool-response-parent:{uuid4().hex}",
                type="approval.resolved",
                data=ApprovalResolvedDataV1(
                    approval=scope.approval.model_copy(update={"status": resolved_status}),
                    resolved_at=command.responded_at,
                    resolved_by_actor_id=str(command.actor_user_id),
                ),
            )
        await self._runtime_repository.append_approval_response(command=command, event=event)
        persisted = await self._repository.get_persisted_response(response_id=command.response_id)
        if persisted is None:
            raise AgentRuntimePersistenceError("AGENT_TOOL_RESPONSE_EVENT_INCONSISTENT")
        return persisted

    @staticmethod
    def _response_command(
        *,
        scope: AgentToolCallCommandScope,
        actor_user_id: UUID,
        response_id: str,
        idempotency_key: str,
        responded_at: datetime,
        payload: AgentToolResponseRequestV1,
    ) -> ToolResponseCommandV1:
        common = {
            "response_id": response_id,
            "workspace_id": scope.workspace_id,
            "project_id": scope.project_id,
            "thread_id": scope.thread_id,
            "run_id": scope.run_id,
            "actor_user_id": actor_user_id,
            "tool_call_id": scope.tool_call_id,
            "checkpoint_id": payload.checkpoint_id,
            "idempotency_key": idempotency_key,
            "responded_at": responded_at,
        }
        if isinstance(payload, AgentApprovalResponseRequestV1):
            return ApprovalToolResponseCommandV1(
                **common,
                kind="approval",
                approval_id=payload.approval_id,
                approval_version=payload.approval_version,
                approved=payload.approved,
                option_id=payload.option_id,
                reason=payload.reason,
            )
        return HumanToolResultResponseCommandV1(
            **common,
            kind="human_result",
            result=payload.result,
        )

    @staticmethod
    def _raise_http(error: AgentRuntimePersistenceError) -> NoReturn:
        if error.code in _NOT_FOUND_ERRORS:
            raise NotFound(error=error.code, message=t("errors", error.code)) from error
        if error.code in _CONFLICT_ERRORS:
            raise Conflict(error=error.code, message=t("errors", error.code)) from error
        if error.code in _BAD_REQUEST_ERRORS:
            raise BadRequest(error=error.code, message=t("errors", error.code)) from error
        raise error


def _response_event_identity(response_id: str) -> tuple[str, str]:
    digest = sha256(f"agent-tool-response:{response_id}".encode()).hexdigest()
    return f"agent-tool-response:{digest}", f"agent-tool-response-cursor:{digest}"


def _tool_response_id(
    *,
    run_id: UUID,
    actor_user_id: UUID,
    idempotency_key: str,
) -> str:
    digest = sha256(f"agent-tool-response-id:{run_id}:{actor_user_id}:{idempotency_key}".encode()).digest()
    value = UUID(bytes=digest[:16], version=4)
    return encode_uuid(value)


def _resume_event_identity(*, run_id: UUID, idempotency_key: str) -> tuple[str, str]:
    digest = sha256(f"agent-run-resume:{run_id}:{idempotency_key}".encode()).hexdigest()
    return f"agent-run-resume:{digest}", f"agent-run-resume-cursor:{digest}"


def _validate_resume_request(
    *,
    state: AgentRunResumeState,
    payload: ResumeAgentRunRequestV1,
) -> None:
    if state.status != "interrupted":
        raise AgentRuntimePersistenceError("AGENT_RUN_NOT_INTERRUPTED")
    if (
        state.checkpoint_id != payload.checkpoint_id
        or state.response_checkpoint_id != payload.checkpoint_id
        or state.response_tool_call_id != state.interrupt_tool_call_id
    ):
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_CHECKPOINT_MISMATCH")
    if (
        state.last_sequence != payload.expected_sequence
        or state.response_expected_sequence != payload.expected_sequence
    ):
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_SEQUENCE_CONFLICT")
    if state.response_consumed_at is not None:
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_RESPONSE_CONSUMED")
    if state.response_kind == "approval" and state.interrupt_reason != "approval_required":
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_CHECKPOINT_MISMATCH")
    if state.response_kind == "human_result" and state.interrupt_reason != "human_tool_input":
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_CHECKPOINT_MISMATCH")


def _validate_resume_replay(
    *,
    state: AgentRunResumeState,
    event: RunResumedEventV1,
    payload: ResumeAgentRunRequestV1,
) -> None:
    if (
        event.run_id != str(state.run_id)
        or event.data.checkpoint_id != payload.checkpoint_id
        or event.sequence - 1 != payload.expected_sequence
        or state.response_expected_sequence != payload.expected_sequence
        or state.response_checkpoint_id != payload.checkpoint_id
        or state.response_kind != event.data.resume_kind
        or state.response_consumed_at != event.data.resumed_at
    ):
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_IDEMPOTENCY_CONFLICT")
