from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_builder_v1 import AgentRunBuilderSnapshotV1Record
from src.models.agents.runtime_design_system_v1 import AgentRunDesignSystemSnapshotV1Record
from src.models.agents.runtime_knowledge_v1 import (
    AgentRunKnowledgeSnapshotV1Record,
    AgentRunKnowledgeSourceSnapshotV1Record,
)
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunExecutionEffectRecord,
    AgentRunRecoveryAction,
    AgentRunRecoveryRecord,
    AgentRunRecoveryStatus,
)
from src.models.agents.runtime_skill_v1 import AgentRunSkillSnapshotV1Record
from src.models.agents.runtime_v1 import (
    AgentExecutionModeV1,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunEventV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentToolResponseV1Record,
)
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.agent_knowledge_context_schema import AgentRunKnowledgeContextV1
from src.modules.ai.runtime_approval_protocol_schema import RunResumedEventV1
from src.modules.ai.runtime_job_schema import AgentRunJobInput, AgentRunJobTarget
from src.modules.ai.runtime_recovery_schema import (
    AgentRunExecutionEffectSnapshot,
    AgentRunRecoveryExecutionSnapshot,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_tool_response_schema import (
    ApprovalToolResponseCommandV1,
    HumanToolResultResponseCommandV1,
)
from src.modules.jobs.hashing import hash_json


class AgentRunJobResumeInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    checkpoint_id: str
    response_kind: Literal["approval", "human_result"]
    resume: JsonObject
    message_id: UUID
    part_id: UUID
    tool_call_id: str
    tool_id: str | None
    tool_version: str | None
    tool_name: str
    args: JsonObject
    args_text: str
    approval: JsonObject | None


class AgentRunJobState(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    run_id: UUID
    job_id: UUID
    workspace_id: UUID
    project_id: UUID | None
    thread_id: UUID
    owner_user_id: UUID
    status: AgentRunStatusV1
    execution_mode: AgentExecutionModeV1
    lead_agent_id: str
    lead_agent_version_id: UUID
    lead_agent_assignment_id: UUID
    mentioned_agent_ids: tuple[UUID, ...]
    mentioned_agent_version_ids: tuple[UUID, ...]
    mentioned_agent_assignment_ids: tuple[UUID, ...]
    skill_snapshot_count: int
    knowledge_context: AgentRunKnowledgeContextV1 | None = None
    knowledge_source_snapshot_count: int = 0
    design_system_context: AgentRunDesignSystemContextV1 | None
    builder_context: AgentRunBuilderContextV1 | None
    correlation_id: str
    last_sequence: int
    last_cursor: str
    prompt: str
    running_part_ids: tuple[str, ...]
    reservation_statuses: tuple[ReservationStatus, ...]
    error_code: str | None
    interrupt_id: str | None
    checkpoint_id: str | None
    interrupt_reason: str | None
    interrupt_approval_id: str | None
    interrupt_tool_call_id: str | None
    resume_input: AgentRunJobResumeInput | None
    execution_effect: AgentRunExecutionEffectSnapshot | None = None
    recovery: AgentRunRecoveryExecutionSnapshot | None = None

    @property
    def terminal(self) -> bool:
        return self.status in {
            AgentRunStatusV1.COMPLETED,
            AgentRunStatusV1.CANCELLED,
            AgentRunStatusV1.FAILED,
        }

    @property
    def settlement_pending(self) -> bool:
        return ReservationStatus.RESERVED in self.reservation_statuses

    @property
    def has_settled_provider_effect(self) -> bool:
        return any(
            status
            in {
                ReservationStatus.COMMITTED,
                ReservationStatus.RELEASED,
                ReservationStatus.EXPIRED,
            }
            for status in self.reservation_statuses
        )


class AgentRunJobRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentRunV1Record)

    async def get_state(
        self,
        *,
        job_id: UUID,
        actor_user_id: UUID,
        target: AgentRunJobTarget,
        input_reference: AgentRunJobInput,
        conn: BaseDBAsyncClient | None = None,
    ) -> AgentRunJobState:
        run = await (
            AgentRunV1Record
            .filter(
                id=input_reference.run_id,
                job_id=job_id,
                workspace_id=target.workspace_id,
                project_id=input_reference.project_id,
                thread_id=input_reference.thread_id,
                owner_user_id=actor_user_id,
                thread__deleted_at=None,
            )
            .using_db(conn)
            .first()
        )
        if run is None or run.last_cursor is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_JOB_SCOPE_INVALID")
        if run.lead_agent_version_id is None or run.lead_agent_assignment_id is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_AGENT_SNAPSHOT_MISSING")
        prompt = await self._get_prompt(run=run, conn=conn)
        running_part_ids = await self._list_running_part_ids(run=run, conn=conn)
        reservations = await (
            AIBudgetReservation.filter(agent_run_id=run.id).using_db(conn).order_by("created_at", "id").all()
        )
        resume_input = await self._get_resume_input(run=run, conn=conn)
        knowledge_context, knowledge_source_snapshot_count = await self._knowledge_context(
            run=run,
            conn=conn,
        )
        design_system_context = await self._design_system_context(run=run, conn=conn)
        builder_context = await self._builder_context(run=run, conn=conn)
        skill_snapshot_count = await AgentRunSkillSnapshotV1Record.filter(run_id=run.id).using_db(conn).count()
        effect_record = await self._latest_execution_effect(job_id=job_id, conn=conn)
        recovery = await self._recovery_execution(run=run, job_id=job_id, conn=conn)
        return AgentRunJobState(
            run_id=run.id,
            job_id=cast(UUID, run.job_id),
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            thread_id=run.thread_id,
            owner_user_id=run.owner_user_id,
            status=AgentRunStatusV1(run.status),
            execution_mode=AgentExecutionModeV1(run.execution_mode),
            lead_agent_id=run.lead_agent_id,
            lead_agent_version_id=run.lead_agent_version_id,
            lead_agent_assignment_id=run.lead_agent_assignment_id,
            mentioned_agent_ids=_uuid_values(run.mentioned_agent_ids),
            mentioned_agent_version_ids=_uuid_values(run.mentioned_agent_version_ids),
            mentioned_agent_assignment_ids=_uuid_values(run.mentioned_agent_assignment_ids),
            skill_snapshot_count=skill_snapshot_count,
            knowledge_context=knowledge_context,
            knowledge_source_snapshot_count=knowledge_source_snapshot_count,
            design_system_context=design_system_context,
            builder_context=builder_context,
            correlation_id=run.correlation_id,
            last_sequence=run.last_sequence,
            last_cursor=run.last_cursor,
            prompt=prompt,
            running_part_ids=running_part_ids,
            reservation_statuses=tuple(ReservationStatus(item.status) for item in reservations),
            error_code=self._error_code(run),
            interrupt_id=run.interrupt_id,
            checkpoint_id=run.checkpoint_id,
            interrupt_reason=run.interrupt_reason,
            interrupt_approval_id=run.interrupt_approval_id,
            interrupt_tool_call_id=run.interrupt_tool_call_id,
            resume_input=resume_input,
            execution_effect=(_execution_effect_snapshot(effect_record) if effect_record is not None else None),
            recovery=recovery,
        )

    @staticmethod
    async def _latest_execution_effect(
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient | None,
    ) -> AgentRunExecutionEffectRecord | None:
        return await (
            AgentRunExecutionEffectRecord
            .filter(job_id=job_id)
            .using_db(conn)
            .order_by("-registered_at", "-id")
            .first()
        )

    @staticmethod
    async def _recovery_execution(
        *,
        run: AgentRunV1Record,
        job_id: UUID,
        conn: BaseDBAsyncClient | None,
    ) -> AgentRunRecoveryExecutionSnapshot | None:
        recovery = await (
            AgentRunRecoveryRecord
            .filter(run_id=run.id, recovery_job_id=job_id)
            .using_db(conn)
            .first()
        )
        if recovery is None:
            return None
        effect_record = await AgentRunJobRepository._latest_execution_effect(
            job_id=recovery.source_job_id,
            conn=conn,
        )
        source_effect = _execution_effect_snapshot(effect_record) if effect_record is not None else None
        return AgentRunRecoveryExecutionSnapshot(
            recovery_id=recovery.id,
            action=AgentRunRecoveryAction(recovery.action),
            status=AgentRunRecoveryStatus(recovery.status),
            source_job_id=recovery.source_job_id,
            source_effect=source_effect,
        )

    @staticmethod
    async def _knowledge_context(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient | None,
    ) -> tuple[AgentRunKnowledgeContextV1 | None, int]:
        record = await AgentRunKnowledgeSnapshotV1Record.filter(run_id=run.id).using_db(conn).first()
        source_count = await AgentRunKnowledgeSourceSnapshotV1Record.filter(run_id=run.id).using_db(conn).count()
        if record is None:
            if source_count:
                raise AgentRuntimePersistenceError("AGENT_KNOWLEDGE_SNAPSHOT_INVALID")
            return None, 0
        context = AgentRunKnowledgeContextV1.model_validate(record.context_snapshot)
        if (
            context.context_hash != record.context_hash
            or context.workspace_id != run.workspace_id
            or context.project_id != run.project_id
            or context.workspace_revision_id != record.workspace_revision_id
            or context.project_revision_id != record.project_revision_id
            or record.source_snapshot_count != source_count
        ):
            raise AgentRuntimePersistenceError("AGENT_KNOWLEDGE_SNAPSHOT_INVALID")
        return context, source_count

    @staticmethod
    async def _design_system_context(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient | None,
    ) -> AgentRunDesignSystemContextV1 | None:
        record = await AgentRunDesignSystemSnapshotV1Record.filter(run_id=run.id).using_db(conn).first()
        if run.project_id is None:
            if record is not None:
                raise AgentRuntimePersistenceError("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")
            return None
        if record is None or record.project_id != run.project_id:
            raise AgentRuntimePersistenceError("AGENT_DESIGN_SYSTEM_SNAPSHOT_MISSING")
        context = AgentRunDesignSystemContextV1.model_validate(record.context_snapshot)
        if (
            context.context_hash != record.context_hash
            or context.assignment_id != record.assignment_id
            or context.assignment_revision != record.assignment_revision
            or context.design_system_id != record.design_system_id
            or context.version_id != record.design_system_version_id
            or context.manifest_checksum != record.manifest_checksum
            or context.validation_finding_hash != record.validation_finding_hash
            or context.token_index_hash != record.token_index_hash
        ):
            raise AgentRuntimePersistenceError("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")
        return context

    @staticmethod
    async def _builder_context(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient | None,
    ) -> AgentRunBuilderContextV1 | None:
        record = await AgentRunBuilderSnapshotV1Record.filter(run_id=run.id).using_db(conn).first()
        if run.site_revision_id is None:
            if record is not None:
                raise AgentRuntimePersistenceError("AGENT_BUILDER_CONTEXT_INVALID")
            return None
        if record is None or record.project_id != run.project_id or record.site_revision_id != run.site_revision_id:
            raise AgentRuntimePersistenceError("AGENT_BUILDER_CONTEXT_MISSING")
        context = AgentRunBuilderContextV1.model_validate(record.context_snapshot)
        if (
            context.context_hash != record.context_hash
            or context.workspace_id != run.workspace_id
            or context.project_id != run.project_id
            or context.site_id != record.site_id
            or context.environment_id != record.environment_id
            or context.site_revision_id != record.site_revision_id
            or context.revision_number != record.revision_number
            or context.manifest_hash != record.manifest_hash
            or context.status_etag != record.status_etag
            or context.content_structure_revision_id != record.content_structure_revision_id
            or context.content_structure_hash != record.content_structure_hash
        ):
            raise AgentRuntimePersistenceError("AGENT_BUILDER_CONTEXT_INVALID")
        return context

    @staticmethod
    async def _get_resume_input(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient | None,
    ) -> AgentRunJobResumeInput | None:
        if AgentRunStatusV1(run.status) != AgentRunStatusV1.RUNNING:
            return None
        record = await (
            AgentRunEventV1Record.filter(run_id=run.id, type="run.resumed").using_db(conn).order_by("-sequence").first()
        )
        if record is None:
            return None
        resumed = RunResumedEventV1.model_validate(record.payload)
        responses = await (
            AgentToolResponseV1Record
            .filter(
                run_id=run.id,
                checkpoint_id=resumed.data.checkpoint_id,
                kind=resumed.data.resume_kind,
                consumed_at=resumed.data.resumed_at,
            )
            .using_db(conn)
            .all()
        )
        if len(responses) != 1:
            raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_RESPONSE_MISSING")
        response = responses[0]
        payload = response.payload
        if resumed.data.resume_kind == "approval":
            command = ApprovalToolResponseCommandV1.model_validate(payload)
            resume = {
                "approved": command.approved,
                "optionId": command.option_id,
                "reason": command.reason,
            }
        else:
            command = HumanToolResultResponseCommandV1.model_validate(payload)
            resume = {"result": command.result}
        part = await AgentMessagePartV1Record.filter(tool_call_id=response.tool_call_id).using_db(conn).first()
        if part is None or part.type != "tool-call":
            raise AgentRuntimePersistenceError("AGENT_TOOL_PART_NOT_FOUND")
        message = await AgentMessageV1Record.filter(id=part.message_id, run_id=run.id).using_db(conn).first()
        part_payload = cast(JsonObject, part.payload)
        args = part_payload.get("args")
        if (
            message is None
            or not isinstance(args, dict)
            or not isinstance(part_payload.get("argsText"), str)
            or not isinstance(part_payload.get("toolName"), str)
        ):
            raise AgentRuntimePersistenceError("AGENT_TOOL_IDENTITY_MISMATCH")
        return AgentRunJobResumeInput(
            checkpoint_id=resumed.data.checkpoint_id,
            response_kind=resumed.data.resume_kind,
            resume=cast(JsonObject, resume),
            message_id=message.id,
            part_id=part.id,
            tool_call_id=response.tool_call_id,
            tool_id=(str(part_payload["toolId"]) if isinstance(part_payload.get("toolId"), str) else None),
            tool_version=(
                str(part_payload["toolVersion"]) if isinstance(part_payload.get("toolVersion"), str) else None
            ),
            tool_name=str(part_payload["toolName"]),
            args=cast(JsonObject, args),
            args_text=str(part_payload["argsText"]),
            approval=(
                cast(JsonObject, part_payload["approval"]) if isinstance(part_payload.get("approval"), dict) else None
            ),
        )

    @staticmethod
    def _error_code(run: AgentRunV1Record) -> str | None:
        error = cast(JsonObject | None, run.error)
        code = error.get("code") if error is not None else None
        return code if isinstance(code, str) and code else None

    @staticmethod
    async def _get_prompt(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient | None,
    ) -> str:
        message = await (
            AgentMessageV1Record
            .filter(
                run_id=run.id,
                role="user",
                actor_user_id=run.owner_user_id,
            )
            .using_db(conn)
            .order_by("created_at", "id")
            .first()
        )
        if message is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_JOB_PROMPT_INVALID")
        part = await (
            AgentMessagePartV1Record
            .filter(message_id=message.id, part_index=0, type="text", status="complete")
            .using_db(conn)
            .first()
        )
        if part is None or not isinstance(part.text, str) or not part.text:
            raise AgentRuntimePersistenceError("AGENT_RUN_JOB_PROMPT_INVALID")
        return part.text

    @staticmethod
    async def _list_running_part_ids(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient | None,
    ) -> tuple[str, ...]:
        message_ids = await AgentMessageV1Record.filter(run_id=run.id).using_db(conn).values_list("id", flat=True)
        parts = await (
            AgentMessagePartV1Record
            .filter(message_id__in=message_ids, status__in=("running", "requires_action"))
            .using_db(conn)
            .order_by("created_at", "id")
            .all()
        )
        return tuple(str(part.id) for part in parts)


def _uuid_values(values: object) -> tuple[UUID, ...]:
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        raise AgentRuntimePersistenceError("AGENT_RUN_AGENT_SNAPSHOT_INVALID")
    try:
        return tuple(UUID(cast(str, value)) for value in values)
    except ValueError as error:
        raise AgentRuntimePersistenceError("AGENT_RUN_AGENT_SNAPSHOT_INVALID") from error


def _execution_effect_snapshot(record: AgentRunExecutionEffectRecord) -> AgentRunExecutionEffectSnapshot:
    outcome = record.outcome if isinstance(record.outcome, dict) else None
    if outcome is not None and hash_json(outcome) != record.outcome_hash:
        raise AgentRuntimePersistenceError("AGENT_RUN_EXECUTION_EFFECT_RECEIPT_INVALID")
    return AgentRunExecutionEffectSnapshot(
        id=record.id,
        run_id=record.run_id,
        job_id=record.job_id,
        owner_attempt_id=record.owner_attempt_id,
        effect_key=record.effect_key,
        request_hash=record.request_hash,
        disposition=AgentRunExecutionEffectDisposition(record.disposition),
        outcome=outcome,
        outcome_hash=record.outcome_hash,
        error_code=record.error_code,
        registered_at=record.registered_at,
        settled_at=record.settled_at,
    )
