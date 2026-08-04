from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.modules.platform_capabilities.rollout_enforcement import (
    TortoiseWorkspaceCapabilityRolloutEnforcer,
    WorkspaceCapabilityRolloutEnforcementPort,
)
from src.modules.platform_capabilities.rollout_repository import TortoiseWorkspaceCapabilityRolloutRepository
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityEligibility,
    WorkspaceCapabilityEligibilityDecision,
    WorkspaceCapabilityEligibilitySnapshot,
    WorkspaceCapabilityOperationalConsequence,
)

AI_SERVICES_CAPABILITY_ID = "ai-services"
_AI_SERVICES_CAPABILITY_REVISION = 2
_AI_SERVICES_ELIGIBILITY_REVISION = 1


class AgentWorkspaceEligibilityReader(Protocol):
    async def list_active_workspace_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
    ) -> tuple[UUID, ...]: ...

    async def is_active_workspace(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool: ...


class AgentWorkspaceCapabilityEligibility:
    """The AI domain's explicit Workspace-only adoption predicate."""

    def __init__(self, repository: AgentWorkspaceEligibilityReader) -> None:
        self._repository = repository

    async def capture_eligibility(
        self,
        *,
        capability_id: str,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityEligibilitySnapshot:
        self._require_ai_services_capability(capability_id)
        workspace_ids = await self._repository.list_active_workspace_ids(conn=conn)
        return WorkspaceCapabilityEligibilitySnapshot(
            capability_revision=_AI_SERVICES_CAPABILITY_REVISION,
            eligibility_revision=_AI_SERVICES_ELIGIBILITY_REVISION,
            workspaces=tuple(
                WorkspaceCapabilityEligibility(workspace_id=UUID(str(workspace_id)), is_eligible=True)
                for workspace_id in workspace_ids
            ),
            operational_consequences=(
                WorkspaceCapabilityOperationalConsequence(
                    code="AI_SERVICES_ROLLOUT_OPERATIONAL_CONSEQUENCE",
                ),
            ),
        )

    async def evaluate_workspace_eligibility(
        self,
        *,
        capability_id: str,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityEligibilityDecision:
        self._require_ai_services_capability(capability_id)
        is_eligible = await self._repository.is_active_workspace(
            workspace_id=workspace_id,
            conn=conn,
        )
        return WorkspaceCapabilityEligibilityDecision(
            capability_revision=_AI_SERVICES_CAPABILITY_REVISION,
            eligibility_revision=_AI_SERVICES_ELIGIBILITY_REVISION,
            workspace=WorkspaceCapabilityEligibility(
                workspace_id=workspace_id,
                is_eligible=is_eligible,
                ineligibility_reasons=() if is_eligible else ("AI_SERVICES_WORKSPACE_INACTIVE",),
            ),
        )

    @staticmethod
    def _require_ai_services_capability(capability_id: str) -> None:
        if capability_id != AI_SERVICES_CAPABILITY_ID:
            raise ValueError("AI Services eligibility only supports ai-services")


def build_agent_catalog_rollout_enforcer() -> WorkspaceCapabilityRolloutEnforcementPort:
    from src.modules.system.agents.rollout_eligibility_repository import (
        TortoiseAgentWorkspaceEligibilityRepository,
    )

    return TortoiseWorkspaceCapabilityRolloutEnforcer(
        repository=TortoiseWorkspaceCapabilityRolloutRepository(),
        eligibility=AgentWorkspaceCapabilityEligibility(
            TortoiseAgentWorkspaceEligibilityRepository(),
        ),
    )
