from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_delegation_v1 import AgentDelegationV1Record
from src.models.agents.runtime_design_system_v1 import AgentRunDesignSystemSnapshotV1Record
from src.models.agents.runtime_output_v1 import AgentChangeSetV1Record
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_snapshot_projector import (
    project_artifact_refs,
    project_message,
    project_message_part,
    project_snapshot,
)
from src.modules.ai.runtime_snapshot_schema import (
    AgentChangeSetSnapshotV1,
    AgentDelegationSnapshotV1,
    AgentMessagePartSnapshotV1,
    AgentMessageSnapshotV1,
    AgentPendingApprovalSnapshotV1,
    AgentRunSnapshotScopeV1,
    AgentRunSnapshotV1,
)

DelegationStatus = Literal["delegated", "completed", "failed"]


class AgentRunSnapshotRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentRunV1Record)

    async def get(self, *, scope: AgentRunSnapshotScopeV1) -> AgentRunSnapshotV1:
        async with in_transaction() as conn:
            run = await self._get_locked_run(scope=scope, conn=conn)
            thread = await self._get_locked_thread(scope=scope, conn=conn)
            messages = await self._messages(run=run, conn=conn)
            approvals = await self._pending_approvals(run=run, conn=conn)
            delegations = await self._delegations(run=run, conn=conn)
            change_sets = await self._change_sets(run=run, conn=conn)
            design_system_context = await self._design_system_context(run=run, conn=conn)
            artifact_refs = project_artifact_refs(
                messages=messages,
                delegations=delegations,
            )
            return project_snapshot(
                run=run,
                thread=thread,
                messages=messages,
                approvals=approvals,
                delegations=delegations,
                change_sets=change_sets,
                artifact_refs=artifact_refs,
                design_system_context=design_system_context,
            )

    @staticmethod
    async def _design_system_context(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> AgentRunDesignSystemContextV1 | None:
        record = await AgentRunDesignSystemSnapshotV1Record.filter(run_id=run.id).using_db(conn).first()
        if run.project_id is None:
            if record is not None:
                raise AgentRuntimePersistenceError("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")
            return None
        if record is None or record.project_id != run.project_id:
            raise AgentRuntimePersistenceError("AGENT_DESIGN_SYSTEM_SNAPSHOT_MISSING")
        context = AgentRunDesignSystemContextV1.model_validate(record.context_snapshot)
        if context.context_hash != record.context_hash:
            raise AgentRuntimePersistenceError("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")
        return context

    @staticmethod
    async def _get_locked_run(
        *,
        scope: AgentRunSnapshotScopeV1,
        conn: BaseDBAsyncClient,
    ) -> AgentRunV1Record:
        run = await (
            AgentRunV1Record
            .filter(
                id=scope.run_id,
                workspace_id=scope.workspace_id,
                project_id=scope.project_id,
                thread_id=scope.thread_id,
                owner_user_id=scope.owner_user_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if run is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        if run.last_sequence < 1 or run.last_cursor is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_HEAD_INCOMPLETE")
        return run

    @staticmethod
    async def _get_locked_thread(
        *,
        scope: AgentRunSnapshotScopeV1,
        conn: BaseDBAsyncClient,
    ) -> AgentThreadV1Record:
        thread = await (
            AgentThreadV1Record
            .filter(
                id=scope.thread_id,
                workspace_id=scope.workspace_id,
                project_id=scope.project_id,
                owner_user_id=scope.owner_user_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if thread is None:
            raise AgentRuntimePersistenceError("AGENT_THREAD_NOT_FOUND")
        return thread

    async def _messages(
        self,
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentMessageSnapshotV1, ...]:
        records = await AgentMessageV1Record.filter(run_id=run.id).using_db(conn).order_by("created_at", "id")
        parts = await (
            AgentMessagePartV1Record
            .filter(message_id__in=[message.id for message in records])
            .using_db(conn)
            .order_by("message_id", "part_index")
        )
        parts_by_message: dict[UUID, list[AgentMessagePartSnapshotV1]] = {}
        for part in parts:
            parts_by_message.setdefault(part.message_id, []).append(project_message_part(part))
        return tuple(
            project_message(
                message,
                parts=tuple(parts_by_message.get(message.id, ())),
            )
            for message in records
        )

    @staticmethod
    async def _pending_approvals(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentPendingApprovalSnapshotV1, ...]:
        records = await (
            AgentApprovalV1Record
            .filter(run_id=run.id, status=AgentApprovalStatusV1.PENDING)
            .using_db(conn)
            .order_by("requested_at", "id")
        )
        message_ids = {
            part.id: part.message_id
            for part in await AgentMessagePartV1Record
            .filter(id__in=[record.message_part_id for record in records])
            .using_db(conn)
            .all()
        }
        return tuple(
            AgentPendingApprovalSnapshotV1(
                approval_id=record.approval_id,
                approval_version=record.approval_version,
                message_id=message_ids[record.message_part_id],
                part_id=record.message_part_id,
                tool_call_id=record.tool_call_id,
                checkpoint_id=record.checkpoint_id,
                status="pending",
                requested_at=record.requested_at,
                expires_at=record.expires_at,
                policy_version=record.policy_version,
                risk=record.risk,
                options=tuple(record.options),
            )
            for record in records
        )

    @staticmethod
    async def _delegations(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentDelegationSnapshotV1, ...]:
        records = await (
            AgentDelegationV1Record.filter(parent_run_id=run.id).using_db(conn).order_by("delegated_at", "id")
        )
        return tuple(
            AgentDelegationSnapshotV1(
                delegation_id=record.delegation_id,
                parent_tool_call_id=record.parent_tool_call_id,
                child_run_id=record.child_run_id,
                source_agent_version_id=record.source_agent_version_id,
                target_agent_version_id=record.target_agent_version_id,
                status=cast(DelegationStatus, str(record.status)),
                delegated_at=record.delegated_at,
                completed_at=record.completed_at,
                failed_at=record.failed_at,
                objective_summary=record.objective_summary,
                summary=record.summary,
                artifact_refs=tuple(record.artifact_refs),
                error=record.error,
            )
            for record in records
        )

    @staticmethod
    async def _change_sets(
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentChangeSetSnapshotV1, ...]:
        records = await AgentChangeSetV1Record.filter(run_id=run.id).using_db(conn).order_by("created_at", "id")
        return tuple(
            AgentChangeSetSnapshotV1(
                change_set_id=record.change_set_id,
                base_revision_id=record.base_revision_id,
                preview_ref=record.preview_ref,
                summary_key=record.summary_key,
                summary_params=record.summary_params,
                warnings=tuple(record.warnings),
                required_approval_ids=tuple(record.required_approval_ids),
            )
            for record in records
        )
