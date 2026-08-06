from __future__ import annotations

from typing import Protocol

from src.llm.policy import require_tool_allowed, resolve_runtime_policy


class AgentToolPolicyAuthorizer(Protocol):
    async def authorize(self, *, tool_id: str) -> None: ...


class GlobalAgentToolPolicyAuthorizer:
    """Re-read the published deployment policy immediately before a Tool effect."""

    async def authorize(self, *, tool_id: str) -> None:
        require_tool_allowed(await resolve_runtime_policy(), tool_id)
