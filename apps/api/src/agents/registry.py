from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from src.agents.types import AgentDefinition, AgentRunContext, AgentToolSpec
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
    ) -> None:
        self._agents = {agent.agent_id: agent for agent in agents}
        self._tools = {tool.spec.name: tool for tool in tools}
        self._assert_agent_tools_are_registered()

    def list_agents(self) -> tuple[AgentDefinition, ...]:
        return tuple(self._agents.values())

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


def build_default_agent_registry(*, tools: tuple[ReadOnlyAgentTool, ...]) -> AgentRegistry:
    agents = (
        AgentDefinition(
            agent_id="content_analyzer",
            name="Content Analyzer",
            description="Analyzes existing content and returns read-only observations.",
            system_prompt=(
                "You are a read-only content analysis agent. Use only the supplied context. "
                "Do not propose direct writes, mutations, publishing actions, or approval decisions."
            ),
            tool_names=("search_content", "list_content_types", "get_content", "analyze_content"),
        ),
        AgentDefinition(
            agent_id="content_advisor",
            name="Content Advisor",
            description="Provides read-only editorial advice for existing content.",
            system_prompt=(
                "You are a read-only content advisor. Provide suggestions only. "
                "Never claim that content has been changed."
            ),
            tool_names=("search_content", "list_content_types", "get_content"),
        ),
        AgentDefinition(
            agent_id="content_model_advisor",
            name="Content Model Advisor",
            description="Reviews content model structure using read-only project context.",
            system_prompt=(
                "You are a read-only content model advisor. Discuss model structure and risks. "
                "Do not create or update content models."
            ),
            tool_names=("list_content_types", "get_content", "search_content"),
        ),
    )
    return AgentRegistry(agents=agents, tools=tools)
