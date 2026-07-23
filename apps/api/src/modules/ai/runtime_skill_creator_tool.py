from __future__ import annotations

import hashlib
from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.skills._enums import SkillPackageScope
from src.modules.workspaces.skills.lifecycle_service import WorkspaceSkillLifecycleService
from src.modules.workspaces.skills.schema import (
    SkillInstallationCreateRequest,
    SkillPackageCreateRequest,
    SkillValidationCreateRequest,
)
from src.modules.workspaces.skills.service import WorkspaceSkillsService


class WorkspaceSkillCreateArgsV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    slug: str = Field(min_length=1, max_length=96)
    display_name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)
    instructions: str = Field(min_length=1, max_length=524_288)
    capability_tags: tuple[str, ...] = Field(default_factory=tuple, max_length=32)


class AgentSkillCreatorToolExecutionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    actor_user_id: UUID
    agent_run_id: UUID
    tool_call_id: str = Field(min_length=1, max_length=192)
    args: WorkspaceSkillCreateArgsV1


class AgentSkillCreatorToolResultV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    package_id: PublicUUID
    version_id: PublicUUID
    installation_id: PublicUUID
    status: str


class AgentSkillCreatorToolExecutor(Protocol):
    async def execute(
        self,
        *,
        request: AgentSkillCreatorToolExecutionRequest,
    ) -> AgentSkillCreatorToolResultV1: ...


class WorkspaceSkillAuthoringAgentToolExecutor:
    def __init__(
        self,
        *,
        skills_service_factory: Callable[[], WorkspaceSkillsService],
        lifecycle_service_factory: Callable[[], WorkspaceSkillLifecycleService],
        organization_id_factory: Callable[[], UUID],
    ) -> None:
        self._skills_service_factory = skills_service_factory
        self._lifecycle_service_factory = lifecycle_service_factory
        self._organization_id_factory = organization_id_factory

    async def execute(
        self,
        *,
        request: AgentSkillCreatorToolExecutionRequest,
    ) -> AgentSkillCreatorToolResultV1:
        organization_id = self._organization_id_factory()
        command_key = _command_key(request)
        created = await self._skills_service_factory().create_package(
            workspace_id=request.workspace_id,
            organization_id=organization_id,
            actor_user_id=request.actor_user_id,
            idempotency_key=f"{command_key}:package",
            payload=SkillPackageCreateRequest(
                slug=request.args.slug,
                display_name=request.args.display_name,
                description=request.args.description,
                instructions=request.args.instructions,
                semantic_version="1.0.0",
                capability_tags=request.args.capability_tags,
            ),
        )
        lifecycle = self._lifecycle_service_factory()
        validation = await lifecycle.create_validation(
            workspace_id=request.workspace_id,
            organization_id=organization_id,
            package_id=UUID(str(created.package.id)),
            version_id=UUID(str(created.version.id)),
            actor_user_id=request.actor_user_id,
            idempotency_key=f"{command_key}:validate",
            payload=SkillValidationCreateRequest(),
        )
        installation = await lifecycle.create_installation(
            workspace_id=request.workspace_id,
            organization_id=organization_id,
            actor_user_id=request.actor_user_id,
            idempotency_key=f"{command_key}:install",
            payload=SkillInstallationCreateRequest(
                package_scope=SkillPackageScope.WORKSPACE,
                package_id=created.package.id,
                version_id=created.version.id,
                expected_package_checksum=created.version.package_checksum,
                validation_finding_hash=validation.finding_hash,
            ),
        )
        return AgentSkillCreatorToolResultV1(
            workspace_id=request.workspace_id,
            package_id=created.package.id,
            version_id=created.version.id,
            installation_id=installation.id,
            status=installation.status,
        )


def _command_key(request: AgentSkillCreatorToolExecutionRequest) -> str:
    call_hash = hashlib.sha256(request.tool_call_id.encode()).hexdigest()[:24]
    return f"agent-skill:{request.agent_run_id.hex}:{call_hash}"


__all__ = [
    "AgentSkillCreatorToolExecutionRequest",
    "AgentSkillCreatorToolExecutor",
    "AgentSkillCreatorToolResultV1",
    "WorkspaceSkillAuthoringAgentToolExecutor",
    "WorkspaceSkillCreateArgsV1",
]
