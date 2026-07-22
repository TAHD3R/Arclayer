from __future__ import annotations

from typing import NoReturn, Protocol
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.agents.runtime_v1 import AgentExecutionModeV1
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_builder_context_service import AgentBuilderContextError, AgentBuilderContextResolver
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.repository import SiteBuilderRepository


class ResolvedBuilderGenerationAuthority(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    agent_run_id: UUID | None
    agent_id: UUID
    agent_version_id: UUID
    agent_assignment_id: UUID
    agent_instructions: str = Field(min_length=1)
    builder_context: AgentRunBuilderContextV1


class BuilderGenerationAuthorityResolver(Protocol):
    async def resolve(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        base_revision_id: UUID,
        base_etag: str,
        agent_run_id: UUID | None,
        agent_id: UUID | None,
        required_tool_grants: tuple[str, ...],
        conn: BaseDBAsyncClient,
    ) -> ResolvedBuilderGenerationAuthority: ...


class CanonicalBuilderGenerationAuthorityResolver:
    def __init__(
        self,
        *,
        generation_repository: BuilderGenerationRepository,
        builder_repository: SiteBuilderRepository,
        agent_catalog_service: AgentCatalogService,
        builder_context_resolver: AgentBuilderContextResolver,
    ) -> None:
        self._generations = generation_repository
        self._builder = builder_repository
        self._agents = agent_catalog_service
        self._contexts = builder_context_resolver

    async def resolve(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        base_revision_id: UUID,
        base_etag: str,
        agent_run_id: UUID | None,
        agent_id: UUID | None,
        required_tool_grants: tuple[str, ...],
        conn: BaseDBAsyncClient,
    ) -> ResolvedBuilderGenerationAuthority:
        if (agent_run_id is None) == (agent_id is None):
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        if agent_id is not None:
            return await self._resolve_direct(
                workspace_id=workspace_id,
                project_id=project_id,
                base_revision_id=base_revision_id,
                base_etag=base_etag,
                agent_id=agent_id,
                required_tool_grants=required_tool_grants,
                conn=conn,
            )
        assert agent_run_id is not None
        return await self._resolve_run(
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            base_revision_id=base_revision_id,
            base_etag=base_etag,
            agent_run_id=agent_run_id,
            required_tool_grants=required_tool_grants,
            conn=conn,
        )

    async def _resolve_direct(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        base_revision_id: UUID,
        base_etag: str,
        agent_id: UUID,
        required_tool_grants: tuple[str, ...],
        conn: BaseDBAsyncClient,
    ) -> ResolvedBuilderGenerationAuthority:
        resolved = await self._agents.resolve_lead(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=agent_id,
            execution_mode="build",
            conn=conn,
            ensure_catalog=False,
        )
        _require_tool_grants(actual=resolved.tool_grants, required=required_tool_grants)
        try:
            builder_input = await self._contexts.resolve_run_context(
                workspace_id=workspace_id,
                project_id=project_id,
                site_revision_id=base_revision_id,
                conn=conn,
            )
        except AgentBuilderContextError:
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        _require_builder_context(
            workspace_id=workspace_id,
            project_id=project_id,
            base_revision_id=base_revision_id,
            base_etag=base_etag,
            context=builder_input.context,
        )
        return ResolvedBuilderGenerationAuthority(
            agent_run_id=None,
            agent_id=resolved.agent_id,
            agent_version_id=resolved.version_id,
            agent_assignment_id=resolved.assignment_id,
            agent_instructions=resolved.instructions,
            builder_context=builder_input.context,
        )

    async def _resolve_run(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        base_revision_id: UUID,
        base_etag: str,
        agent_run_id: UUID,
        required_tool_grants: tuple[str, ...],
        conn: BaseDBAsyncClient,
    ) -> ResolvedBuilderGenerationAuthority:
        run = await self._builder.get_agent_run_for_builder(
            run_id=agent_run_id,
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            conn=conn,
        )
        snapshot = await self._generations.get_agent_builder_snapshot(run_id=agent_run_id, conn=conn)
        if run is None or snapshot is None:
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        try:
            execution_mode = AgentExecutionModeV1(str(run.execution_mode))
            lead_agent_id = UUID(str(run.lead_agent_id))
            lead_version_id = UUID(str(run.lead_agent_version_id))
            lead_assignment_id = UUID(str(run.lead_agent_assignment_id))
            builder_context = AgentRunBuilderContextV1.model_validate(snapshot.context_snapshot)
        except (TypeError, ValueError):
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        if (
            execution_mode is not AgentExecutionModeV1.BUILD
            or UUID(str(run.site_revision_id)) != base_revision_id
            or UUID(str(snapshot.site_revision_id)) != base_revision_id
            or builder_context.context_hash != snapshot.context_hash
        ):
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        _require_builder_context(
            workspace_id=workspace_id,
            project_id=project_id,
            base_revision_id=base_revision_id,
            base_etag=base_etag,
            context=builder_context,
        )
        resolved = await self._agents.resolve_lead(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=lead_agent_id,
            execution_mode="build",
            conn=conn,
            ensure_catalog=False,
        )
        if resolved.version_id != lead_version_id or resolved.assignment_id != lead_assignment_id:
            _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
        _require_tool_grants(actual=resolved.tool_grants, required=required_tool_grants)
        return ResolvedBuilderGenerationAuthority(
            agent_run_id=agent_run_id,
            agent_id=resolved.agent_id,
            agent_version_id=resolved.version_id,
            agent_assignment_id=resolved.assignment_id,
            agent_instructions=resolved.instructions,
            builder_context=builder_context,
        )


def _require_builder_context(
    *,
    workspace_id: UUID,
    project_id: UUID,
    base_revision_id: UUID,
    base_etag: str,
    context: AgentRunBuilderContextV1,
) -> None:
    if (
        UUID(str(context.workspace_id)) != workspace_id
        or UUID(str(context.project_id)) != project_id
        or UUID(str(context.site_revision_id)) != base_revision_id
        or context.manifest_hash != base_etag
    ):
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")


def _require_tool_grants(*, actual: tuple[str, ...], required: tuple[str, ...]) -> None:
    if not set(required).issubset(actual):
        _raise_conflict("AGENT_BUILDER_TOOL_NOT_GRANTED")


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = [
    "BuilderGenerationAuthorityResolver",
    "CanonicalBuilderGenerationAuthorityResolver",
    "ResolvedBuilderGenerationAuthority",
]
