from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.ai.agent_catalog_manifest import official_agent_id
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1


def _payload(**overrides):
    values = {
        "lead_agent_id": official_agent_id("arclayer-coordinator"),
        "execution_mode": "plan",
        "message": "为一家咨询公司规划中文官网。",
    }
    values.update(overrides)
    return values


def test_workspace_build_requires_confirmed_plan_run() -> None:
    with pytest.raises(ValidationError, match="confirmedPlanRunId"):
        AgentRunCreateRequestV1(**_payload(execution_mode="build"))


def test_plan_run_cannot_claim_build_confirmation() -> None:
    with pytest.raises(ValidationError, match="confirmedPlanRunId"):
        AgentRunCreateRequestV1(
            **_payload(
                confirmed_plan_run_id=uuid4(),
            )
        )


def test_existing_project_build_does_not_need_plan_confirmation() -> None:
    payload = AgentRunCreateRequestV1(
        **_payload(
            project_id=uuid4(),
            execution_mode="build",
        )
    )
    assert payload.confirmed_plan_run_id is None
