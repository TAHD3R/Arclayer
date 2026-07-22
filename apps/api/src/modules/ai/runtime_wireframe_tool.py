from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Literal, Protocol, cast
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_tool_grants import BUILDER_WIREFRAME_GENERATE_TOOL
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalOptionV1,
    ApprovalRiskV1,
    ApprovalV1,
)
from src.modules.ai.runtime_execution_gateway import AgentRunExecutionInterrupted
from src.modules.projects.builder.generation_schema import (
    BuilderGenerationCreateRequest,
    BuilderGenerationTargetV1,
)
from src.modules.projects.builder.generation_service import BuilderGenerationService


class WireframeGenerateArgsV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    page_item_id: PublicUUID
    objective: str = Field(min_length=1, max_length=8000)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    candidate_count: int = Field(default=2, ge=1, le=3)


class AgentWireframeToolExecutionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID
    actor_user_id: UUID
    agent_run_id: UUID
    tool_call_id: str = Field(min_length=1, max_length=192)
    args: WireframeGenerateArgsV1
    builder_context: AgentRunBuilderContextV1

    @model_validator(mode="after")
    def require_exact_context_scope(self) -> AgentWireframeToolExecutionRequest:
        if (
            UUID(str(self.builder_context.workspace_id)) != self.workspace_id
            or UUID(str(self.builder_context.project_id)) != self.project_id
        ):
            raise ValueError("Wireframe Tool context does not belong to the requested scope")
        return self


class AgentWireframeToolResultV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    job_id: PublicUUID
    project_id: PublicUUID
    base_revision_id: PublicUUID
    target_stage: Literal["wireframe"] = "wireframe"
    selected_page_id: PublicUUID
    status: Literal["queued", "running", "partial", "succeeded", "failed", "cancelled"]


class AgentWireframeToolExecutor(Protocol):
    async def execute(
        self,
        *,
        request: AgentWireframeToolExecutionRequest,
    ) -> AgentWireframeToolResultV1: ...


RuntimeIdResolver = Callable[[UUID], Awaitable[UUID | None]]


class BuilderWireframeAgentToolExecutor:
    def __init__(
        self,
        *,
        service_factory: Callable[[], BuilderGenerationService],
        organization_id_factory: Callable[[], UUID],
        runtime_id_resolver: RuntimeIdResolver,
    ) -> None:
        self._service_factory = service_factory
        self._organization_id_factory = organization_id_factory
        self._runtime_id_resolver = runtime_id_resolver

    async def execute(
        self,
        *,
        request: AgentWireframeToolExecutionRequest,
    ) -> AgentWireframeToolResultV1:
        runtime_id = await self._runtime_id_resolver(request.project_id)
        if runtime_id is None:
            raise ValueError("Wireframe Tool project Runtime is unavailable")
        result = await self._service_factory().create(
            organization_id=self._organization_id_factory(),
            workspace_id=request.workspace_id,
            project_id=request.project_id,
            runtime_id=runtime_id,
            actor_user_id=request.actor_user_id,
            idempotency_key=_command_key(request),
            payload=BuilderGenerationCreateRequest(
                target_stage="wireframe",
                base_revision_id=request.builder_context.site_revision_id,
                base_etag=request.builder_context.manifest_hash,
                agent_run_id=request.agent_run_id,
                objective=request.args.objective,
                locale=request.args.locale,
                candidate_count=request.args.candidate_count,
                targets=(
                    BuilderGenerationTargetV1(
                        kind="page",
                        item_id=request.args.page_item_id,
                    ),
                ),
            ),
        )
        return AgentWireframeToolResultV1(
            generation_id=result.generation_id,
            job_id=result.job_id,
            project_id=request.project_id,
            base_revision_id=result.base_revision_id,
            selected_page_id=request.args.page_item_id,
            status=cast(
                Literal["queued", "running", "partial", "succeeded", "failed", "cancelled"],
                str(result.status),
            ),
        )


def _command_key(request: AgentWireframeToolExecutionRequest) -> str:
    call_hash = hashlib.sha256(request.tool_call_id.encode()).hexdigest()[:32]
    return f"agent-wireframe:{request.agent_run_id.hex}:{call_hash}"


def build_wireframe_approval_interruption(
    *,
    agent_run_id: UUID,
    tool_call_id: str,
    arguments: WireframeGenerateArgsV1,
) -> AgentRunExecutionInterrupted:
    now = datetime.now(UTC)
    serialized_arguments = cast(JsonObject, arguments.model_dump(mode="json", by_alias=True))
    approval_id = hashlib.sha256(f"{agent_run_id}:{tool_call_id}:wireframe-approval-v1".encode()).hexdigest()
    approval = ApprovalV1(
        approval_id=approval_id,
        approval_version=1,
        tool_call_id=tool_call_id,
        checkpoint_id="pending-langgraph-checkpoint",
        status="pending",
        requested_at=now,
        expires_at=now + timedelta(hours=1),
        policy_version="wireframe-generation-v1",
        risk=ApprovalRiskV1(
            side_effect_class="draft_write",
            summary_key="ai:AI_AGENT_APPROVAL_WIREFRAME_GENERATE_SUMMARY",
            summary_params={
                "pageItemId": serialized_arguments["pageItemId"],
                "objective": arguments.objective,
                "candidateCount": arguments.candidate_count,
            },
            preview_ref=None,
        ),
        options=(
            ApprovalOptionV1(
                id="allow_once",
                kind="allow-once",
                label_key="ai:AI_AGENT_APPROVAL_WIREFRAME_ALLOW_ONCE",
                description_key="ai:AI_AGENT_APPROVAL_WIREFRAME_ALLOW_ONCE_DESC",
                grants=(BUILDER_WIREFRAME_GENERATE_TOOL,),
                confirm=False,
            ),
            ApprovalOptionV1(
                id="reject_once",
                kind="reject-once",
                label_key="ai:AI_AGENT_APPROVAL_WIREFRAME_REJECT_ONCE",
                description_key="ai:AI_AGENT_APPROVAL_WIREFRAME_REJECT_ONCE_DESC",
                grants=(),
                confirm=False,
            ),
        ),
    )
    return AgentRunExecutionInterrupted(
        interrupt_id="pending-langgraph-interrupt",
        checkpoint_id="pending-langgraph-checkpoint",
        reason="approval_required",
        tool_call_id=tool_call_id,
        tool_id=BUILDER_WIREFRAME_GENERATE_TOOL,
        tool_version="1",
        tool_name=BUILDER_WIREFRAME_GENERATE_TOOL,
        args=serialized_arguments,
        approval=approval,
    )


__all__ = [
    "AgentWireframeToolExecutionRequest",
    "AgentWireframeToolExecutor",
    "AgentWireframeToolResultV1",
    "BuilderWireframeAgentToolExecutor",
    "RuntimeIdResolver",
    "WireframeGenerateArgsV1",
    "build_wireframe_approval_interruption",
]
