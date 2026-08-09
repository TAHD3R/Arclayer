from __future__ import annotations

import pytest

from src.modules.ai.runtime_command_repository import _resume_response_tool_id
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError


def test_approval_resume_uses_canonical_tool_name_before_tool_execution() -> None:
    assert _resume_response_tool_id({"toolName": "project.bootstrap"}, "approval") == "project.bootstrap"


def test_human_resume_uses_started_tool_id() -> None:
    assert _resume_response_tool_id({"toolId": "human.request_input"}, "human_result") == "human.request_input"


@pytest.mark.parametrize(
    ("part_payload", "response_kind"),
    [
        ({"toolId": "project.bootstrap"}, "approval"),
        ({"toolName": "human.request_input"}, "human_result"),
        (None, "approval"),
    ],
)
def test_resume_rejects_missing_lifecycle_specific_tool_identity(
    part_payload: object,
    response_kind: str,
) -> None:
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_RUN_RESUME_CHECKPOINT_MISMATCH"):
        _resume_response_tool_id(part_payload, response_kind)  # type: ignore[arg-type]
