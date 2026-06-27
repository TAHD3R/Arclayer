from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from src.agents.settings_policy import write_skill_runtime_policy_disabled_reason
from src.agents.types import AgentDefinition, AgentMode, AgentRunContext, AgentSkillDefinition, AgentToolSpec
from src.core.exceptions import BadRequest, Forbidden, NotFound
from src.core.i18n import t


class ReadOnlyAgentTool(ABC):
    spec: AgentToolSpec

    @abstractmethod
    async def run(self, context: AgentRunContext, input_data: dict[str, Any]) -> dict[str, Any]:
        """Execute a read-only tool and return JSON-serializable output."""


class AgentRegistry:
    def __init__(
        self,
        *,
        agents: tuple[AgentDefinition, ...],
        tools: tuple[ReadOnlyAgentTool, ...],
        skills: tuple[AgentSkillDefinition, ...],
    ) -> None:
        self._agents = {agent.agent_id: agent for agent in agents}
        self._tools = {tool.spec.name: tool for tool in tools}
        self._skills = {skill.skill_id: skill for skill in skills}
        self._assert_agent_tools_are_registered()

    def list_agents(self, *, mode: AgentMode | None = None) -> tuple[AgentDefinition, ...]:
        agents = tuple(self._agents.values())
        if mode is None:
            return agents
        return tuple(agent for agent in agents if agent.mode == mode)

    def list_skills(self) -> tuple[AgentSkillDefinition, ...]:
        return tuple(self._skills.values())

    def require_agent(self, agent_id: str) -> AgentDefinition:
        agent = self._agents.get(agent_id)
        if agent is None:
            raise NotFound(message=t("errors", "AGENT_NOT_FOUND"), error="AGENT_NOT_FOUND")
        return agent

    def list_tools_for_agent(self, agent_id: str) -> tuple[AgentToolSpec, ...]:
        agent = self.require_agent(agent_id)
        return tuple(self.require_tool(name).spec for name in agent.tool_names)

    def require_agent_tool(self, *, agent_id: str, tool_name: str) -> ReadOnlyAgentTool:
        agent = self.require_agent(agent_id)
        if tool_name not in agent.tool_names:
            raise BadRequest(message=t("errors", "AGENT_TOOL_NOT_ALLOWED"), error="AGENT_TOOL_NOT_ALLOWED")
        return self.require_tool(tool_name)

    def require_tool(self, name: str) -> ReadOnlyAgentTool:
        tool = self._tools.get(name)
        if tool is None:
            raise BadRequest(message=t("errors", "AGENT_TOOL_NOT_FOUND"), error="AGENT_TOOL_NOT_FOUND")
        if not tool.spec.read_only:
            raise Forbidden(message=t("errors", "AGENT_TOOL_WRITE_FORBIDDEN"), error="AGENT_TOOL_WRITE_FORBIDDEN")
        return tool

    def _assert_agent_tools_are_registered(self) -> None:
        missing = sorted({
            name for agent in self._agents.values() for name in agent.tool_names if name not in self._tools
        })
        if missing:
            raise BadRequest(
                message=t("errors", "AGENT_TOOL_NOT_FOUND"),
                error="AGENT_TOOL_NOT_FOUND",
                meta={"toolNames": missing},
            )


def build_default_agent_registry(
    *,
    tools: tuple[ReadOnlyAgentTool, ...],
    agents_enabled: bool = True,
    skills_enabled: bool = True,
    enabled_skill_ids: set[str] | None = None,
    write_tools_enabled: bool = False,
    approval_policy: str = "always_approve",
    dry_run_required: bool = True,
) -> AgentRegistry:
    read_only_agents = (
        AgentDefinition(
            agent_id="content_analyzer",
            name="Content Analyzer",
            description="Analyzes existing content and returns read-only observations.",
            system_prompt=(
                "You are a read-only content analysis agent. Use only the supplied context. "
                "Do not propose direct writes, mutations, publishing actions, or approval decisions."
            ),
            skill_id="content.analysis",
            tool_names=("search_content", "list_content_types", "get_content", "analyze_content"),
        ),
        AgentDefinition(
            agent_id="content_advisor",
            name="Content Advisor",
            description="Provides read-only editorial advice for existing content.",
            system_prompt=(
                "You are a read-only planning agent. Produce a staged execution plan with clear numbered "
                "steps, risks, approval checkpoints, and verification notes. Never claim that content has "
                "been changed."
            ),
            mode=AgentMode.PLAN,
            skill_id="content.planning",
            tool_names=("search_content", "list_content_types", "get_content"),
        ),
        AgentDefinition(
            agent_id="content_builder",
            name="Content Builder",
            description="Builds read-only implementation blueprints for content operations.",
            system_prompt=(
                "You are a read-only build agent. Produce an implementation blueprint with concrete "
                "numbered operations, required approvals, validation checks, and rollback notes. Do not "
                "claim that content, schema, routes, assets, or settings have been changed."
            ),
            mode=AgentMode.BUILD,
            skill_id="content.build",
            tool_names=("search_content", "list_content_types", "get_content", "analyze_content"),
        ),
        AgentDefinition(
            agent_id="content_model_advisor",
            name="Content Model Advisor",
            description="Reviews content model structure using read-only project context.",
            system_prompt=(
                "You are a read-only content model advisor. Discuss model structure and risks. "
                "Do not create or update content models."
            ),
            skill_id="content.modeling",
            tool_names=("list_content_types", "get_content", "search_content"),
        ),
    )
    agents = _filter_enabled_agents(
        agents=read_only_agents,
        agents_enabled=agents_enabled,
        skills_enabled=skills_enabled,
        enabled_skill_ids=enabled_skill_ids,
    )
    return AgentRegistry(
        agents=agents,
        tools=tools,
        skills=_build_skill_catalog(
            agents=read_only_agents,
            enabled_agents=agents,
            agents_enabled=agents_enabled,
            skills_enabled=skills_enabled,
            enabled_skill_ids=enabled_skill_ids,
            write_tools_enabled=write_tools_enabled,
            approval_policy=approval_policy,
            dry_run_required=dry_run_required,
        ),
    )


def _filter_enabled_agents(
    *,
    agents: tuple[AgentDefinition, ...],
    agents_enabled: bool,
    skills_enabled: bool,
    enabled_skill_ids: set[str] | None,
) -> tuple[AgentDefinition, ...]:
    if not agents_enabled or not skills_enabled:
        return ()
    if enabled_skill_ids is None:
        return agents
    return tuple(agent for agent in agents if agent.skill_id in enabled_skill_ids)


def _build_skill_catalog(
    *,
    agents: tuple[AgentDefinition, ...],
    enabled_agents: tuple[AgentDefinition, ...],
    agents_enabled: bool,
    skills_enabled: bool,
    enabled_skill_ids: set[str] | None,
    write_tools_enabled: bool,
    approval_policy: str,
    dry_run_required: bool,
) -> tuple[AgentSkillDefinition, ...]:
    enabled_agent_ids = {agent.agent_id for agent in enabled_agents}
    read_only_skills = tuple(
        _agent_skill(
            agent=agent,
            enabled=skills_enabled
            and agent.agent_id in enabled_agent_ids
            and (enabled_skill_ids is None or agent.skill_id in enabled_skill_ids),
            disabled_reason=_disabled_reason(
                agents_enabled=agents_enabled,
                skills_enabled=skills_enabled,
                skill_id=agent.skill_id,
                enabled_skill_ids=enabled_skill_ids,
            ),
        )
        for agent in agents
    )
    return read_only_skills + (
        AgentSkillDefinition(
            skill_id="content.writer",
            name="Content Writer",
            description="Draft content write operations through dry-run and approval before execution.",
            mode=AgentMode.AGENT,
            read_only=False,
            requires_approval=True,
            enabled=_write_skill_enabled(
                agents_enabled=agents_enabled,
                skills_enabled=skills_enabled,
                enabled_skill_ids=enabled_skill_ids,
                write_tools_enabled=write_tools_enabled,
                approval_policy=approval_policy,
                dry_run_required=dry_run_required,
                skill_id="content.writer",
            ),
            disabled_reason=_write_skill_disabled_reason(
                agents_enabled=agents_enabled,
                skills_enabled=skills_enabled,
                enabled_skill_ids=enabled_skill_ids,
                write_tools_enabled=write_tools_enabled,
                approval_policy=approval_policy,
                dry_run_required=dry_run_required,
            ),
            approval_policy=approval_policy,
        ),
        AgentSkillDefinition(
            skill_id="content.modeler",
            name="Content Modeler",
            description="Draft content model schema changes through impact preview and approval before execution.",
            mode=AgentMode.AGENT,
            agent_id="content_model_advisor",
            read_only=False,
            requires_approval=True,
            enabled=_write_skill_enabled(
                agents_enabled=agents_enabled,
                skills_enabled=skills_enabled,
                enabled_skill_ids=enabled_skill_ids,
                write_tools_enabled=write_tools_enabled,
                approval_policy=approval_policy,
                dry_run_required=dry_run_required,
                skill_id="content.modeler",
            ),
            disabled_reason=_write_skill_disabled_reason(
                agents_enabled=agents_enabled,
                skills_enabled=skills_enabled,
                enabled_skill_ids=enabled_skill_ids,
                write_tools_enabled=write_tools_enabled,
                approval_policy=approval_policy,
                dry_run_required=dry_run_required,
                skill_id="content.modeler",
            ),
            approval_policy=approval_policy,
        ),
    )


def _agent_skill(
    *,
    agent: AgentDefinition,
    enabled: bool,
    disabled_reason: str | None,
) -> AgentSkillDefinition:
    return AgentSkillDefinition(
        skill_id=agent.skill_id,
        name=agent.name,
        description=agent.description,
        mode=agent.mode,
        agent_id=agent.agent_id,
        tool_names=agent.tool_names,
        read_only=agent.read_only,
        requires_approval=agent.requires_approval,
        enabled=enabled,
        disabled_reason=disabled_reason,
    )


def _disabled_reason(
    *,
    agents_enabled: bool,
    skills_enabled: bool,
    skill_id: str,
    enabled_skill_ids: set[str] | None,
) -> str | None:
    if not agents_enabled:
        return "agents_disabled"
    if not skills_enabled:
        return "skills_disabled"
    if enabled_skill_ids is not None and skill_id not in enabled_skill_ids:
        return "skill_not_allowlisted"
    return None


def _write_skill_disabled_reason(
    *,
    agents_enabled: bool,
    skills_enabled: bool,
    enabled_skill_ids: set[str] | None,
    write_tools_enabled: bool,
    approval_policy: str,
    dry_run_required: bool,
    skill_id: str = "content.writer",
) -> str | None:
    if not agents_enabled:
        return "agents_disabled"
    if not skills_enabled:
        return "skills_disabled"
    if enabled_skill_ids is not None and skill_id not in enabled_skill_ids:
        return "skill_not_allowlisted"
    if not write_tools_enabled:
        return "write_tools_disabled"
    return write_skill_runtime_policy_disabled_reason(
        approval_policy=approval_policy,
        dry_run_required=dry_run_required,
        skill_id=skill_id,
    )


def _write_skill_enabled(
    *,
    agents_enabled: bool,
    skills_enabled: bool,
    enabled_skill_ids: set[str] | None,
    write_tools_enabled: bool,
    approval_policy: str,
    dry_run_required: bool,
    skill_id: str,
) -> bool:
    return (
        _write_skill_disabled_reason(
            agents_enabled=agents_enabled,
            skills_enabled=skills_enabled,
            enabled_skill_ids=enabled_skill_ids,
            write_tools_enabled=write_tools_enabled,
            approval_policy=approval_policy,
            dry_run_required=dry_run_required,
            skill_id=skill_id,
        )
        is None
    )
