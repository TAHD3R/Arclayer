from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.services import BaseService
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityRolloutEnforcement,
    WorkspaceCapabilityRolloutRuntimeSnapshot,
    WorkspaceCapabilityRolloutStage,
)
from src.modules.platform_capabilities.rollout_service import WorkspaceCapabilityEligibilityPort


class WorkspaceCapabilityRolloutEnforcementPort(Protocol):
    """Product APIs, workers, and owning domains call this before capability use."""

    async def evaluate_workspace_capability(
        self, *, capability_id: str, workspace_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> WorkspaceCapabilityRolloutEnforcement: ...


class WorkspaceCapabilityRolloutRuntimeReader(Protocol):
    async def load_runtime_snapshot(
        self, *, capability_id: str, workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceCapabilityRolloutRuntimeSnapshot | None: ...


class TortoiseWorkspaceCapabilityRolloutEnforcer(BaseService):
    """Evaluates only rollout scope; callers retain every independent capability gate."""

    def __init__(
        self,
        *,
        repository: WorkspaceCapabilityRolloutRuntimeReader,
        eligibility: WorkspaceCapabilityEligibilityPort,
    ) -> None:
        super().__init__()
        self._repository = repository
        self._eligibility = eligibility

    async def evaluate_workspace_capability(
        self,
        *,
        capability_id: str,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceCapabilityRolloutEnforcement:
        async with self.tx(conn=conn) as tx_conn:
            rollout = await self._repository.load_runtime_snapshot(
                capability_id=capability_id,
                workspace_id=workspace_id,
                conn=tx_conn,
            )
            if rollout is not None and rollout.stage == WorkspaceCapabilityRolloutStage.NOT_AVAILABLE:
                return WorkspaceCapabilityRolloutEnforcement(
                    capability_id=capability_id,
                    workspace_id=workspace_id,
                    rollout_revision=rollout.rollout_revision,
                    is_available=False,
                    denial_code="WORKSPACE_CAPABILITY_ROLLOUT_NOT_AVAILABLE",
                )
            eligibility = await self._eligibility.evaluate_workspace_eligibility(
                capability_id=capability_id,
                workspace_id=workspace_id,
                conn=tx_conn,
            )
            if not eligibility.workspace.is_eligible:
                return WorkspaceCapabilityRolloutEnforcement(
                    capability_id=capability_id,
                    workspace_id=workspace_id,
                    rollout_revision=0 if rollout is None else rollout.rollout_revision,
                    is_available=False,
                    denial_code="WORKSPACE_CAPABILITY_ROLLOUT_INELIGIBLE",
                    ineligibility_reasons=eligibility.workspace.ineligibility_reasons,
                )
            if rollout is None or rollout.stage == WorkspaceCapabilityRolloutStage.ALL_ELIGIBLE:
                return WorkspaceCapabilityRolloutEnforcement(
                    capability_id=capability_id,
                    workspace_id=workspace_id,
                    rollout_revision=0 if rollout is None else rollout.rollout_revision,
                    is_available=True,
                )
            selected = rollout.is_selected
            return WorkspaceCapabilityRolloutEnforcement(
                capability_id=capability_id,
                workspace_id=workspace_id,
                rollout_revision=rollout.rollout_revision,
                is_available=selected,
                denial_code=None if selected else "WORKSPACE_CAPABILITY_ROLLOUT_NOT_SELECTED",
            )
