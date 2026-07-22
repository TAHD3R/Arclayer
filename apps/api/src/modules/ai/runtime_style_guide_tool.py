from __future__ import annotations

import hashlib
from collections.abc import Callable
from typing import Literal, Protocol, cast
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.projects.design_systems.concept_schema import DesignSystemConceptGenerationCreateRequest
from src.modules.projects.design_systems.concept_service import DesignSystemConceptGenerationService


class StyleGuideGenerateArgsV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    objective: str = Field(min_length=1, max_length=8000)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    candidate_count: int = Field(default=2, ge=1, le=3)


class AgentStyleGuideToolExecutionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID
    actor_user_id: UUID
    agent_run_id: UUID
    tool_call_id: str = Field(min_length=1, max_length=192)
    args: StyleGuideGenerateArgsV1
    design_system_context: AgentRunDesignSystemContextV1
    builder_context: AgentRunBuilderContextV1

    @model_validator(mode="after")
    def require_exact_context_scope(self) -> AgentStyleGuideToolExecutionRequest:
        if (
            UUID(str(self.design_system_context.project_id)) != self.project_id
            or UUID(str(self.builder_context.workspace_id)) != self.workspace_id
            or UUID(str(self.builder_context.project_id)) != self.project_id
        ):
            raise ValueError("Style Guide Tool contexts do not belong to the requested scope")
        return self


class AgentStyleGuideToolResultV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: PublicUUID
    job_id: PublicUUID
    project_id: PublicUUID
    design_system_id: PublicUUID
    base_version_id: PublicUUID
    base_revision_id: PublicUUID
    status: Literal["queued", "running", "partial", "succeeded", "failed", "cancelled"]


class AgentStyleGuideToolExecutor(Protocol):
    async def execute(
        self,
        *,
        request: AgentStyleGuideToolExecutionRequest,
    ) -> AgentStyleGuideToolResultV1: ...


class DesignSystemConceptAgentToolExecutor:
    def __init__(
        self,
        *,
        service_factory: Callable[[], DesignSystemConceptGenerationService],
        organization_id_factory: Callable[[], UUID],
    ) -> None:
        self._service_factory = service_factory
        self._organization_id_factory = organization_id_factory

    async def execute(
        self,
        *,
        request: AgentStyleGuideToolExecutionRequest,
    ) -> AgentStyleGuideToolResultV1:
        result = await self._service_factory().create(
            organization_id=self._organization_id_factory(),
            workspace_id=request.workspace_id,
            project_id=request.project_id,
            design_system_id=UUID(str(request.design_system_context.design_system_id)),
            actor_user_id=request.actor_user_id,
            idempotency_key=_command_key(request),
            payload=DesignSystemConceptGenerationCreateRequest(
                base_version_id=request.design_system_context.version_id,
                expected_base_checksum=request.design_system_context.manifest_checksum,
                base_revision_id=request.builder_context.site_revision_id,
                base_etag=request.builder_context.manifest_hash,
                agent_run_id=request.agent_run_id,
                objective=request.args.objective,
                locale=request.args.locale,
                candidate_count=request.args.candidate_count,
            ),
        )
        return AgentStyleGuideToolResultV1(
            generation_id=result.generation_id,
            job_id=result.job_id,
            project_id=request.project_id,
            design_system_id=result.design_system_id,
            base_version_id=result.base_version_id,
            base_revision_id=result.base_revision_id,
            status=cast(
                Literal["queued", "running", "partial", "succeeded", "failed", "cancelled"],
                str(result.status),
            ),
        )


def _command_key(request: AgentStyleGuideToolExecutionRequest) -> str:
    call_hash = hashlib.sha256(request.tool_call_id.encode()).hexdigest()[:32]
    return f"agent-style-guide:{request.agent_run_id.hex}:{call_hash}"


__all__ = [
    "AgentStyleGuideToolExecutionRequest",
    "AgentStyleGuideToolExecutor",
    "AgentStyleGuideToolResultV1",
    "DesignSystemConceptAgentToolExecutor",
    "StyleGuideGenerateArgsV1",
]
