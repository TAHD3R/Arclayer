from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.workspaces.workspace import Workspace
from src.modules.platform_capabilities.rollout_enforcement import (
    TortoiseWorkspaceCapabilityRolloutEnforcer,
    WorkspaceCapabilityRolloutEnforcementPort,
)
from src.modules.platform_capabilities.rollout_repository import TortoiseWorkspaceCapabilityRolloutRepository
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityEligibility,
    WorkspaceCapabilityEligibilityDecision,
    WorkspaceCapabilityEligibilitySnapshot,
)

AI_SERVICES_CAPABILITY_ID = "ai-services"
_AI_SERVICES_CAPABILITY_REVISION = 1
_AI_SERVICES_ELIGIBILITY_REVISION = 1


class AgentWorkspaceCapabilityEligibility:
    """The AI domain's explicit Workspace-only adoption predicate."""

    async def capture_eligibility(
        self,
        *,
        capability_id: str,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityEligibilitySnapshot:
        self._require_ai_services_capability(capability_id)
        workspace_ids = await (
            Workspace
            .filter(is_active=True, archived_at=None, deleted_at=None)
            .using_db(conn)
            .order_by("id")
            .values_list("id", flat=True)
        )
        return WorkspaceCapabilityEligibilitySnapshot(
            capability_revision=_AI_SERVICES_CAPABILITY_REVISION,
            eligibility_revision=_AI_SERVICES_ELIGIBILITY_REVISION,
            workspaces=tuple(
                WorkspaceCapabilityEligibility(workspace_id=UUID(str(workspace_id)), is_eligible=True)
                for workspace_id in workspace_ids
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
        is_eligible = (
            await Workspace
            .filter(
                id=workspace_id,
                is_active=True,
                archived_at=None,
                deleted_at=None,
            )
            .using_db(conn)
            .exists()
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
    return TortoiseWorkspaceCapabilityRolloutEnforcer(
        repository=TortoiseWorkspaceCapabilityRolloutRepository(),
        eligibility=AgentWorkspaceCapabilityEligibility(),
    )
