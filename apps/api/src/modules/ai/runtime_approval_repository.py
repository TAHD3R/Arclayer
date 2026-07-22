from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunV1Record,
)
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalProjectionEventV1,
    ApprovalRequiredEventV1,
    ApprovalResolvedEventV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError


class AgentApprovalProjectionRepository(TortoiseORMRepository[AgentApprovalV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentApprovalV1Record)

    async def project(
        self,
        *,
        run: AgentRunV1Record,
        event: ApprovalProjectionEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if isinstance(event, ApprovalRequiredEventV1):
            await self._require(run=run, event=event, conn=conn)
        else:
            await self._resolve(run=run, event=event, conn=conn)

    async def _require(
        self,
        *,
        run: AgentRunV1Record,
        event: ApprovalRequiredEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        approval = event.data.approval
        message_id = self._parse_uuid(event.data.message_id)
        part_id = self._parse_uuid(event.data.part_id)
        part = await self._get_locked_tool_part(
            run=run,
            tool_call_id=approval.tool_call_id,
            conn=conn,
            message_id=message_id,
            part_id=part_id,
        )
        payload = cast(JsonObject, part.payload)
        if (
            part.status != "running"
            or payload.get("toolCallId") != approval.tool_call_id
            or "startedAt" in payload
            or await AgentApprovalV1Record
            .filter(run_id=run.id, status=AgentApprovalStatusV1.PENDING)
            .using_db(conn)
            .exists()
        ):
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_CONTRACT_MISMATCH")
        await self.create_record(
            AgentApprovalV1Record,
            conn=conn,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            thread_id=run.thread_id,
            run_id=run.id,
            message_part_id=part.id,
            owner_user_id=run.owner_user_id,
            approval_id=approval.approval_id,
            approval_version=approval.approval_version,
            tool_call_id=approval.tool_call_id,
            checkpoint_id=approval.checkpoint_id,
            status=AgentApprovalStatusV1.PENDING,
            requested_at=approval.requested_at,
            expires_at=approval.expires_at,
            policy_version=approval.policy_version,
            risk=approval.risk.model_dump(by_alias=True, mode="json"),
            options=[option.model_dump(by_alias=True, mode="json") for option in approval.options],
        )
        part.status = "requires_action"
        part.payload = {
            **payload,
            "status": "requires_action",
            "approval": approval.model_dump(by_alias=True, mode="json"),
        }
        await part.save(update_fields=["status", "payload", "updated_at"], using_db=conn)

    async def _resolve(
        self,
        *,
        run: AgentRunV1Record,
        event: ApprovalResolvedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        projection = event.data.approval
        approval = await (
            AgentApprovalV1Record
            .filter(approval_id=projection.approval_id, run_id=run.id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if approval is None:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_NOT_FOUND")
        self._validate_resolution_identity(run=run, approval=approval, event=event)
        part = await self._get_locked_tool_part(
            run=run,
            tool_call_id=projection.tool_call_id,
            conn=conn,
            part_id=approval.message_part_id,
        )
        if part.status != "requires_action":
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_CONTRACT_MISMATCH")
        try:
            actor_id = UUID(event.data.resolved_by_actor_id)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_ACTOR_INVALID") from error
        approval.status = AgentApprovalStatusV1(projection.status)
        approval.resolved_at = event.data.resolved_at
        approval.resolved_by_actor_id = actor_id
        await approval.save(
            update_fields=["status", "resolved_at", "resolved_by_actor_id", "updated_at"],
            using_db=conn,
        )
        status = "running" if projection.status == "approved" else "failed"
        payload = cast(JsonObject, part.payload)
        part.status = status
        part.payload = {
            **payload,
            "status": status,
            "approval": projection.model_dump(by_alias=True, mode="json"),
        }
        await part.save(update_fields=["status", "payload", "updated_at"], using_db=conn)

    @staticmethod
    def _validate_resolution_identity(
        *,
        run: AgentRunV1Record,
        approval: AgentApprovalV1Record,
        event: ApprovalResolvedEventV1,
    ) -> None:
        projection = event.data.approval
        if approval.status != AgentApprovalStatusV1.PENDING:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_ALREADY_RESOLVED")
        if approval.approval_version != projection.approval_version:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_VERSION_CONFLICT")
        if (
            approval.workspace_id != run.workspace_id
            or approval.project_id != run.project_id
            or approval.thread_id != run.thread_id
            or approval.tool_call_id != projection.tool_call_id
            or approval.checkpoint_id != projection.checkpoint_id
            or approval.requested_at != projection.requested_at
            or approval.expires_at != projection.expires_at
            or approval.policy_version != projection.policy_version
            or approval.risk != projection.risk.model_dump(by_alias=True, mode="json")
            or approval.options != [option.model_dump(by_alias=True, mode="json") for option in projection.options]
            or run.interrupt_approval_id != projection.approval_id
            or run.checkpoint_id != projection.checkpoint_id
            or run.interrupt_tool_call_id != projection.tool_call_id
        ):
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_CONTRACT_MISMATCH")

    @staticmethod
    async def _get_locked_tool_part(
        *,
        run: AgentRunV1Record,
        tool_call_id: str,
        conn: BaseDBAsyncClient,
        message_id: UUID | None = None,
        part_id: UUID | None = None,
    ) -> AgentMessagePartV1Record:
        filters: dict[str, object] = {"tool_call_id": tool_call_id}
        if message_id is not None:
            filters["message_id"] = message_id
        if part_id is not None:
            filters["id"] = part_id
        part = await AgentMessagePartV1Record.filter(**filters).using_db(conn).select_for_update().first()
        if part is None or part.type != "tool-call":
            raise AgentRuntimePersistenceError("AGENT_TOOL_PART_NOT_FOUND")
        message_exists = await AgentMessageV1Record.filter(id=part.message_id, run_id=run.id).using_db(conn).exists()
        if not message_exists:
            raise AgentRuntimePersistenceError("AGENT_TOOL_PART_NOT_FOUND")
        return part

    @staticmethod
    def _parse_uuid(value: str) -> UUID:
        try:
            return UUID(value)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_IDENTIFIER_INVALID") from error
