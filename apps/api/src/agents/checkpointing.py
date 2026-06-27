from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver

from src.agents.langgraph_runtime import AgentGraphCheckpointerFactory
from src.config import Settings
from src.core.exceptions import Forbidden
from src.core.i18n import t

_MEMORY_CHECKPOINTER = InMemorySaver()


@asynccontextmanager
async def memory_agent_checkpointer() -> AsyncIterator[BaseCheckpointSaver]:
    yield _MEMORY_CHECKPOINTER


def build_agent_checkpointer_factory(
    *,
    settings: Settings,
    checkpointer: str,
) -> AgentGraphCheckpointerFactory:
    if checkpointer == "memory":
        return memory_agent_checkpointer
    if checkpointer == "database":
        if not settings.database.enabled:
            raise Forbidden(
                message=t("errors", "AGENT_LANGGRAPH_DATABASE_CHECKPOINTER_DISABLED"),
                error="AGENT_LANGGRAPH_DATABASE_CHECKPOINTER_DISABLED",
                meta={"disabledReason": "database_disabled"},
            )
        return _postgres_agent_checkpointer_factory(settings.database.dsn_async)
    raise Forbidden(
        message=t("errors", "AGENT_LANGGRAPH_CHECKPOINTER_UNSUPPORTED"),
        error="AGENT_LANGGRAPH_CHECKPOINTER_UNSUPPORTED",
        meta={"checkpointer": checkpointer},
    )


def _postgres_agent_checkpointer_factory(dsn: str) -> AgentGraphCheckpointerFactory:
    @asynccontextmanager
    async def _postgres_agent_checkpointer() -> AsyncIterator[BaseCheckpointSaver]:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        async with AsyncPostgresSaver.from_conn_string(dsn) as saver:
            await saver.setup()
            yield saver

    return _postgres_agent_checkpointer
