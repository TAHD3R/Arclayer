from __future__ import annotations

import pytest

from src.common.types.json_types import JsonObject
from src.core.exceptions import BadRequest
from src.settings.core_schema import CORE_SETTINGS_SCHEMA
from src.settings.schema import ConfigField
from src.settings.validation import validate_config_schema


def _section_fields(section_id: str) -> dict[str, ConfigField]:
    section = next(section for section in CORE_SETTINGS_SCHEMA.sections if section.id == section_id)
    return {field.key: field for field in section.fields}


def test_core_settings_schema_includes_agent_runtime_controls() -> None:
    agent_fields = _section_fields("ai_agents")

    assert agent_fields["enabled"].default is True
    assert agent_fields["default_mode"].default == "build"
    assert agent_fields["default_model"].default == "deepseek-v4-pro"
    assert agent_fields["system_prompt"].default == ""
    assert agent_fields["conversation_retention_days"].default == 90
    assert agent_fields["monthly_budget_micros"].default == 100_000_000
    assert agent_fields["allowed_skill_ids"].default == [
        "content.analysis",
        "content.planning",
        "content.build",
        "content.modeling",
        "content.writer",
        "content.modeler",
    ]
    assert agent_fields["write_tools_enabled"].default is False
    assert agent_fields["approval_policy"].default == "always_approve"
    assert agent_fields["dry_run_required"].default is True


def test_core_settings_schema_includes_langgraph_persistence_controls() -> None:
    langgraph_fields = _section_fields("langgraph")

    assert langgraph_fields["enabled"].default is True
    assert langgraph_fields["checkpointer"].default == "database"
    assert langgraph_fields["checkpoint_ttl_days"].default == 90
    assert langgraph_fields["interrupt_resume_enabled"].default is True


@pytest.mark.parametrize(
    ("patch", "section", "field"),
    [
        ({"ai_agents": {"default_model": "   "}}, "ai_agents", "default_model"),
        ({"ai_agents": {"default_mode": "execute"}}, "ai_agents", "default_mode"),
        ({"ai_agents": {"reasoning_effort": "maximum"}}, "ai_agents", "reasoning_effort"),
        ({"ai_agents": {"conversation_retention_days": 0}}, "ai_agents", "conversation_retention_days"),
        ({"ai_agents": {"monthly_budget_micros": 0}}, "ai_agents", "monthly_budget_micros"),
        ({"ai_agents": {"approval_policy": "silent_auto_apply"}}, "ai_agents", "approval_policy"),
        ({"ai_agents": {"allowed_skill_ids": ["content.analysis", "  "]}}, "ai_agents", "allowed_skill_ids"),
        ({"langgraph": {"checkpointer": "filesystem"}}, "langgraph", "checkpointer"),
        ({"langgraph": {"checkpoint_ttl_days": 0}}, "langgraph", "checkpoint_ttl_days"),
    ],
)
def test_ai_agent_settings_schema_rejects_invalid_runtime_values(
    patch: JsonObject,
    section: str,
    field: str,
) -> None:
    with pytest.raises(BadRequest) as exc:
        validate_config_schema(CORE_SETTINGS_SCHEMA, patch)

    assert exc.value.error == "SETTINGS_CONFIG_INVALID"
    assert exc.value.meta == {"section": section, "field": field}


def test_ai_agent_settings_schema_accepts_valid_runtime_values() -> None:
    validate_config_schema(
        CORE_SETTINGS_SCHEMA,
        {
            "ai_agents": {
                "default_mode": "agent",
                "default_model": "openai/gpt-5-mini",
                "system_prompt": "Respond with concise project-aware guidance.",
                "reasoning_effort": "high",
                "conversation_retention_days": 30,
                "monthly_budget_micros": 25_000_000,
                "approval_policy": "approve_schema_only",
                "allowed_skill_ids": ["content.analysis", "content.modeler"],
            },
            "langgraph": {
                "checkpointer": "database",
                "checkpoint_ttl_days": 30,
            },
        },
    )
