from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.agent_skill_grant_service import with_selected_lead_skill_installations
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1


def test_run_create_request_rejects_duplicate_selected_skill_installations() -> None:
    installation_id = uuid4()

    with pytest.raises(ValidationError, match="selectedSkillInstallationIds must be unique"):
        AgentRunCreateRequestV1(
            lead_agent_id=uuid4(),
            selected_skill_installation_ids=(installation_id, installation_id),
            execution_mode="plan",
            message="Plan the launch.",
        )


def test_selected_skill_installations_extend_fixed_lead_grants_in_stable_order() -> None:
    workspace_id = uuid4()
    fixed_first = uuid4()
    fixed_second = uuid4()
    selected = uuid4()
    lead = ResolvedAgentAssignment(
        assignment_id=uuid4(),
        agent_id=uuid4(),
        version_id=uuid4(),
        version_number=1,
        supported_execution_modes=("plan",),
        tool_grants=(),
        skill_grant_workspace_id=workspace_id,
        skill_installation_ids=(fixed_first, fixed_second),
        delegation_agent_ids=(),
        instructions="Plan only.",
    )

    effective = with_selected_lead_skill_installations(
        workspace_id=workspace_id,
        lead_agent=lead,
        selected_skill_installation_ids=(fixed_second, selected),
    )

    assert effective.skill_installation_ids == (fixed_first, fixed_second, selected)
    assert effective.skill_grant_workspace_id == workspace_id


def test_selected_skill_installations_bind_the_workspace_for_a_skill_free_lead() -> None:
    workspace_id = uuid4()
    selected = uuid4()
    lead = ResolvedAgentAssignment(
        assignment_id=uuid4(),
        agent_id=uuid4(),
        version_id=uuid4(),
        version_number=1,
        supported_execution_modes=("plan",),
        tool_grants=(),
        skill_grant_workspace_id=None,
        skill_installation_ids=(),
        delegation_agent_ids=(),
        instructions="Plan only.",
    )

    effective = with_selected_lead_skill_installations(
        workspace_id=workspace_id,
        lead_agent=lead,
        selected_skill_installation_ids=(selected,),
    )

    assert effective.skill_installation_ids == (selected,)
    assert effective.skill_grant_workspace_id == workspace_id
