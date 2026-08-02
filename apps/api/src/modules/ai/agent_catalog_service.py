from __future__ import annotations

from typing import Literal, NoReturn, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings, get_settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.models.agents.catalog import (
    AgentAssignmentRecord,
    AgentDefinitionRecord,
    AgentLifecycleState,
    AgentVersionRecord,
    AgentVersionState,
)
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_repository import AgentCatalogRepository, AgentCatalogRepositoryError
from src.modules.ai.agent_catalog_schema import (
    ResolvedAgentAssignment,
    WorkspaceAgentCatalogItemV1,
    WorkspaceAgentCatalogV1,
)
from src.modules.platform_capabilities.rollout_enforcement import WorkspaceCapabilityRolloutEnforcementPort
from src.modules.system.agents.rollout_eligibility import (
    AI_SERVICES_CAPABILITY_ID,
    build_agent_catalog_rollout_enforcer,
)
from src.settings.runtime import get_core_settings_value_cached

ExecutionMode = Literal["plan", "build"]


class AgentCatalogService:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        repository: AgentCatalogRepository | None = None,
        rollout_enforcer: WorkspaceCapabilityRolloutEnforcementPort | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._repository = repository or AgentCatalogRepository()
        self._rollout_enforcer = rollout_enforcer or build_agent_catalog_rollout_enforcer()

    async def ensure_official_assignments(self, *, workspace_id: UUID) -> None:
        await self._require_workspace(workspace_id=workspace_id)
        await self._require_rollout(workspace_id=workspace_id)
        try:
            await self._repository.reconcile_official(workspace_id=workspace_id)
        except AgentCatalogRepositoryError as error:
            self._raise_conflict(error.code)

    async def ensure_all_workspaces_ready(self) -> None:
        return None

    async def list_available(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
    ) -> WorkspaceAgentCatalogV1:
        await self.ensure_official_assignments(workspace_id=workspace_id)
        await self._require_project(workspace_id=workspace_id, project_id=project_id)
        assignments = await self._repository.effective_assignments(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        agents_enabled = await self._agents_enabled()
        items = tuple(self._to_catalog_item(record, agents_enabled=agents_enabled) for record in assignments)
        scoped_items = tuple(zip(assignments, items, strict=True))
        project_default = next(
            (
                item.agent_id
                for assignment, item in scoped_items
                if project_id is not None and assignment.project_id == project_id and item.is_default and item.available
            ),
            None,
        )
        workspace_default = next(
            (
                item.agent_id
                for assignment, item in scoped_items
                if assignment.project_id is None and item.is_default and item.available
            ),
            None,
        )
        default = project_default or workspace_default
        return WorkspaceAgentCatalogV1(agents=items, default_agent_id=default)

    async def resolve_lead(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        agent_id: UUID,
        execution_mode: ExecutionMode | None = None,
        conn: BaseDBAsyncClient | None = None,
        ensure_catalog: bool = True,
    ) -> ResolvedAgentAssignment:
        if ensure_catalog:
            await self.ensure_official_assignments(workspace_id=workspace_id)
        else:
            await self._require_rollout(workspace_id=workspace_id, conn=conn)
        await self._require_project(workspace_id=workspace_id, project_id=project_id, conn=conn)
        assignment = await self._repository.find_effective_assignment(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=agent_id,
            conn=conn,
        )
        if assignment is None:
            self._raise_not_found("AGENT_ASSIGNMENT_NOT_FOUND")
        resolved = await self._resolve_record(assignment)
        await self._require_available(assignment=assignment)
        if execution_mode is not None and execution_mode not in resolved.supported_execution_modes:
            self._raise_conflict("AGENT_EXECUTION_MODE_UNSUPPORTED")
        return resolved

    async def resolve_run_agents(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        lead_agent_id: UUID,
        mentioned_agent_ids: tuple[UUID, ...],
        execution_mode: ExecutionMode,
        conn: BaseDBAsyncClient | None = None,
        ensure_catalog: bool = True,
    ) -> tuple[ResolvedAgentAssignment, tuple[ResolvedAgentAssignment, ...]]:
        lead = await self.resolve_lead(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=lead_agent_id,
            execution_mode=execution_mode,
            conn=conn,
            ensure_catalog=ensure_catalog,
        )
        mentioned: list[ResolvedAgentAssignment] = []
        for agent_id in mentioned_agent_ids:
            if agent_id == lead_agent_id:
                self._raise_conflict("AGENT_MENTION_DUPLICATES_LEAD")
            assignment = await self._repository.find_effective_assignment(
                workspace_id=workspace_id,
                project_id=project_id,
                agent_id=agent_id,
                conn=conn,
            )
            if assignment is None:
                self._raise_not_found("AGENT_MENTION_ASSIGNMENT_NOT_FOUND")
            resolved = await self._resolve_record(assignment)
            await self._require_available(assignment=assignment)
            if agent_id not in lead.delegation_agent_ids:
                self._raise_conflict("AGENT_DELEGATION_NOT_ALLOWED")
            mentioned.append(resolved)
        return lead, tuple(mentioned)

    async def mark_used(self, *, assignment_id: UUID, conn: BaseDBAsyncClient | None = None) -> None:
        await self._repository.mark_used(assignment_id=assignment_id, conn=conn)

    async def validate_run_snapshot(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        lead_agent_id: UUID,
        lead_agent_version_id: UUID,
        lead_agent_assignment_id: UUID,
        mentioned_agent_ids: tuple[UUID, ...],
        mentioned_agent_version_ids: tuple[UUID, ...],
        mentioned_agent_assignment_ids: tuple[UUID, ...],
        execution_mode: ExecutionMode,
    ) -> tuple[ResolvedAgentAssignment, tuple[ResolvedAgentAssignment, ...]]:
        await self._require_rollout(workspace_id=workspace_id)
        if not (len(mentioned_agent_ids) == len(mentioned_agent_version_ids) == len(mentioned_agent_assignment_ids)):
            self._raise_conflict("AGENT_RUN_AGENT_SNAPSHOT_INVALID")
        lead = await self._resolve_snapshot_assignment(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=lead_agent_id,
            version_id=lead_agent_version_id,
            assignment_id=lead_agent_assignment_id,
        )
        if execution_mode not in lead.supported_execution_modes:
            self._raise_conflict("AGENT_EXECUTION_MODE_UNSUPPORTED")
        mentioned_agents: list[ResolvedAgentAssignment] = []
        for agent_id, version_id, assignment_id in zip(
            mentioned_agent_ids,
            mentioned_agent_version_ids,
            mentioned_agent_assignment_ids,
            strict=True,
        ):
            mentioned = await self._resolve_snapshot_assignment(
                workspace_id=workspace_id,
                project_id=project_id,
                agent_id=agent_id,
                version_id=version_id,
                assignment_id=assignment_id,
            )
            if mentioned.agent_id not in lead.delegation_agent_ids:
                self._raise_conflict("AGENT_DELEGATION_NOT_ALLOWED")
            mentioned_agents.append(mentioned)
        return lead, tuple(mentioned_agents)

    async def _resolve_snapshot_assignment(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        agent_id: UUID,
        version_id: UUID,
        assignment_id: UUID,
    ) -> ResolvedAgentAssignment:
        assignment = await self._repository.get_snapshot_assignment(
            workspace_id=workspace_id,
            project_id=project_id,
            agent_id=agent_id,
            version_id=version_id,
            assignment_id=assignment_id,
        )
        if assignment is None:
            self._raise_not_found("AGENT_ASSIGNMENT_NOT_FOUND")
        resolved = await self._resolve_record(assignment)
        await self._require_available(assignment=assignment)
        return resolved

    async def _resolve_record(self, assignment: AgentAssignmentRecord) -> ResolvedAgentAssignment:
        try:
            return await self._repository.resolve_record(assignment)
        except AgentCatalogRepositoryError as error:
            self._raise_conflict(error.code)

    async def _require_rollout(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        enforcement = await self._rollout_enforcer.evaluate_workspace_capability(
            capability_id=AI_SERVICES_CAPABILITY_ID,
            workspace_id=workspace_id,
            conn=conn,
        )
        if not enforcement.is_available:
            self._raise_conflict(enforcement.denial_code or "WORKSPACE_CAPABILITY_ROLLOUT_NOT_AVAILABLE")

    async def _agents_enabled(self) -> bool:
        core = await get_core_settings_value_cached(self._settings)
        section = core.get("ai_agents") if isinstance(core, dict) else None
        agent_settings = cast(dict[str, object], section) if isinstance(section, dict) else None
        enabled = agent_settings.get("enabled") if agent_settings is not None else None
        return enabled if isinstance(enabled, bool) else True

    async def _require_available(self, *, assignment: AgentAssignmentRecord) -> None:
        if not await self._agents_enabled() or not assignment.enabled:
            self._raise_conflict("AGENT_ASSIGNMENT_DISABLED")
        definition = cast(AgentDefinitionRecord, assignment.definition)
        version = cast(AgentVersionRecord, assignment.version)
        if definition.lifecycle_state != AgentLifecycleState.ACTIVE or version.state != AgentVersionState.PUBLISHED:
            self._raise_conflict("AGENT_ASSIGNMENT_DISABLED")

    @staticmethod
    async def _require_workspace(*, workspace_id: UUID) -> None:
        exists = await Workspace.filter(id=workspace_id, is_active=True, archived_at=None, deleted_at=None).exists()
        if not exists:
            AgentCatalogService._raise_not_found("AGENT_WORKSPACE_NOT_FOUND")

    @staticmethod
    async def _require_project(
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        if project_id is None:
            return
        exists = (
            await ProjectRecord
            .filter(
                id=project_id,
                workspace_id=workspace_id,
                is_active=True,
            )
            .using_db(conn)
            .exists()
        )
        if not exists:
            AgentCatalogService._raise_not_found("AGENT_PROJECT_NOT_FOUND")

    @staticmethod
    def _to_catalog_item(assignment: AgentAssignmentRecord, *, agents_enabled: bool) -> WorkspaceAgentCatalogItemV1:
        definition = cast(AgentDefinitionRecord, assignment.definition)
        version = cast(AgentVersionRecord, assignment.version)
        available = (
            agents_enabled
            and assignment.enabled
            and definition.lifecycle_state == AgentLifecycleState.ACTIVE
            and version.state == AgentVersionState.PUBLISHED
        )
        try:
            modes = tuple(_require_string_list(version.supported_execution_modes))
            collaborators = tuple(UUID(value) for value in _require_string_list(version.delegation_definition_ids))
            tool_grants = tuple(_require_string_list(version.tool_grants))
        except (TypeError, ValueError) as error:
            raise Conflict(error="AGENT_VERSION_INVALID", message=t("errors", "AGENT_VERSION_INVALID")) from error
        if any(mode not in {"plan", "build"} for mode in modes):
            AgentCatalogService._raise_conflict("AGENT_VERSION_INVALID")
        return WorkspaceAgentCatalogItemV1(
            agent_id=definition.id,
            version_id=version.id,
            assignment_id=assignment.id,
            version_number=version.version_number,
            slug=definition.slug,
            name=definition.display_name,
            name_i18n_key=definition.name_i18n_key,
            role=definition.role,
            role_i18n_key=definition.role_i18n_key,
            description=definition.description,
            description_i18n_key=definition.description_i18n_key,
            avatar_url=definition.avatar_url,
            scope=cast(Literal["system", "workspace"], str(definition.scope)),
            provenance="arclayer_official" if definition.is_official else "workspace",
            supported_execution_modes=cast(tuple[ExecutionMode, ...], modes),
            collaboration_agent_ids=collaborators,
            tool_grants=tool_grants,
            available=available,
            unavailable_reason=(
                None if available else "agents_disabled" if not agents_enabled else "assignment_disabled"
            ),
            is_default=assignment.is_default,
            is_pinned=assignment.is_pinned,
        )

    @staticmethod
    def _raise_not_found(code: str) -> NoReturn:
        raise NotFound(error=code, message=t("errors", code))

    @staticmethod
    def _raise_conflict(code: str) -> NoReturn:
        raise Conflict(error=code, message=t("errors", code))


def _require_string_list(values: object) -> list[str]:
    if not isinstance(values, list) or any(not isinstance(value, str) or not value for value in values):
        AgentCatalogService._raise_conflict("AGENT_VERSION_INVALID")
    return cast(list[str], values)
