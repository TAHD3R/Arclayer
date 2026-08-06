from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.modules.platform_capabilities.rollout_enforcement import (
    TortoiseWorkspaceCapabilityRolloutEnforcer,
)
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityEligibility,
    WorkspaceCapabilityEligibilityDecision,
    WorkspaceCapabilityEligibilitySnapshot,
)


class MissingRolloutRepository:
    async def load_runtime_snapshot(
        self,
        *,
        capability_id: str,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = (capability_id, workspace_id, conn)
        return None


class IneligibleWorkspacePort:
    async def capture_eligibility(
        self,
        *,
        capability_id: str,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityEligibilitySnapshot:
        _ = (capability_id, conn)
        return WorkspaceCapabilityEligibilitySnapshot(
            capability_revision=1,
            eligibility_revision=1,
            workspaces=(),
        )

    async def evaluate_workspace_eligibility(
        self,
        *,
        capability_id: str,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCapabilityEligibilityDecision:
        _ = (capability_id, conn)
        return WorkspaceCapabilityEligibilityDecision(
            capability_revision=1,
            eligibility_revision=1,
            workspace=WorkspaceCapabilityEligibility(
                workspace_id=workspace_id,
                is_eligible=False,
                ineligibility_reasons=("workspace_plan_ineligible",),
            ),
        )


@pytest.mark.asyncio
async def test_missing_rollout_keeps_ineligible_workspace_denial_explicit() -> None:
    workspace_id = uuid4()
    service = TortoiseWorkspaceCapabilityRolloutEnforcer(
        repository=MissingRolloutRepository(),
        eligibility=IneligibleWorkspacePort(),
    )

    result = await service.evaluate_workspace_capability(
        capability_id="workspace-feature",
        workspace_id=workspace_id,
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert result.rollout_revision == 0
    assert result.is_available is False
    assert result.denial_code == "WORKSPACE_CAPABILITY_ROLLOUT_INELIGIBLE"
    assert result.ineligibility_reasons == ("workspace_plan_ineligible",)
