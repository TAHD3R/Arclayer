from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.agents.catalog import AgentVersionState
from src.modules.system.agents.assignment_service import SystemAgentAssignmentService
from src.modules.system.agents.definition_service import (
    SystemAgentDefinitionService,
    agent_catalog_capabilities,
)
from src.modules.system.agents.repository_protocol import SystemAgentRepositoryProtocol
from src.modules.system.agents.schema import (
    AgentVersionCreateRequest,
    SystemAgentAssignmentOut,
    SystemAgentCatalogCapabilitiesOut,
    SystemAgentDefinitionCreateRequest,
    SystemAgentDefinitionDetailOut,
    SystemAgentDefinitionSummaryOut,
    SystemAgentDefinitionUpdateRequest,
    SystemAgentVersionOut,
)
from src.modules.system.agents.service_base import ActivityWriter


class SystemAgentCatalogService(BaseService):
    """Stable control-plane façade over Definition and Assignment lifecycle services."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: SystemAgentRepositoryProtocol,
        activity_writer: ActivityWriter,
    ) -> None:
        super().__init__(
            settings,
            event_publisher=None,
            default_event_source="system_agent_control_plane",
        )
        dependencies = {
            "repository": repository,
            "activity_writer": activity_writer,
        }
        self._definitions = SystemAgentDefinitionService(self.settings, **dependencies)
        self._assignments = SystemAgentAssignmentService(self.settings, **dependencies)

    @staticmethod
    def capabilities() -> SystemAgentCatalogCapabilitiesOut:
        return agent_catalog_capabilities()

    async def list_definitions(
        self,
        *,
        params: PageParams,
        query: str | None,
        lifecycle_state: str | None,
        scope: str | None,
    ) -> PageData[SystemAgentDefinitionSummaryOut]:
        return await self._definitions.list_definitions(
            params=params,
            query=query,
            lifecycle_state=lifecycle_state,
            scope=scope,
        )

    async def get_definition(self, *, definition_id: UUID) -> SystemAgentDefinitionDetailOut:
        return await self._definitions.get_definition(definition_id=definition_id)

    async def create_definition(
        self,
        *,
        payload: SystemAgentDefinitionCreateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentDefinitionDetailOut:
        return await self._definitions.create_definition(
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def update_definition(
        self,
        *,
        definition_id: UUID,
        payload: SystemAgentDefinitionUpdateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentDefinitionDetailOut:
        return await self._definitions.update_definition(
            definition_id=definition_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def create_version(
        self,
        *,
        definition_id: UUID,
        payload: AgentVersionCreateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentVersionOut:
        return await self._definitions.create_version(
            definition_id=definition_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def transition_version(
        self,
        *,
        definition_id: UUID,
        version_id: UUID,
        desired_state: AgentVersionState,
        actor_user_id: UUID,
    ) -> SystemAgentVersionOut:
        return await self._definitions.transition_version(
            definition_id=definition_id,
            version_id=version_id,
            desired_state=desired_state,
            actor_user_id=actor_user_id,
        )

    async def list_assignments(
        self,
        *,
        params: PageParams,
        workspace_id: UUID | None,
        project_id: UUID | None,
        definition_id: UUID | None,
        enabled: bool | None,
    ) -> PageData[SystemAgentAssignmentOut]:
        return await self._assignments.list_assignments(
            params=params,
            workspace_id=workspace_id,
            project_id=project_id,
            definition_id=definition_id,
            enabled=enabled,
        )
