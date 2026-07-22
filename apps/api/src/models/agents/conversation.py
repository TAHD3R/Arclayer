from __future__ import annotations

from enum import StrEnum


class AgentConversationMode(StrEnum):
    BUILD = "build"
    PLAN = "plan"
    AGENT = "agent"
