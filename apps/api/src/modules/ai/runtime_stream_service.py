from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from time import monotonic
from typing import NoReturn
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import APIError, BadRequest, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_snapshot_repository import AgentRunSnapshotRepository
from src.modules.ai.runtime_snapshot_schema import AgentRunSnapshotScopeV1, AgentRunSnapshotV1
from src.modules.ai.runtime_stream_repository import AgentRunStreamRepository
from src.modules.ai.runtime_stream_schema import AgentRunOwnedScopeV1, AgentRunStreamSessionV1

_SSE_POLL_INTERVAL_SECONDS = 0.25
_SSE_KEEPALIVE_INTERVAL_SECONDS = 15.0
_TERMINAL_EVENT_TYPES = {"run.completed", "run.cancelled", "run.failed"}


class AgentRunStreamService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        stream_repository: AgentRunStreamRepository | None = None,
        snapshot_repository: AgentRunSnapshotRepository | None = None,
    ) -> None:
        super().__init__(
            settings,
            event_publisher=None,
            default_event_source="agent_run_stream",
        )
        self._stream_repository = stream_repository or AgentRunStreamRepository()
        self._snapshot_repository = snapshot_repository or AgentRunSnapshotRepository()

    async def get_snapshot(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        run_id: UUID,
    ) -> AgentRunSnapshotV1:
        scope = await self._resolve_scope(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            run_id=run_id,
        )
        return await self._snapshot(scope)

    async def prepare_stream(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        run_id: UUID,
        query_cursor: str | None,
        last_event_id: str | None,
    ) -> AgentRunStreamSessionV1:
        scope = await self._resolve_scope(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            run_id=run_id,
        )
        cursor = self._select_cursor(query_cursor=query_cursor, last_event_id=last_event_id)
        try:
            start_sequence = await self._stream_repository.resolve_cursor_sequence(scope=scope, cursor=cursor)
        except AgentRuntimePersistenceError as error:
            if error.code == "EVENT_CURSOR_EXPIRED":
                await self._raise_cursor_expired(scope)
            self._raise_http(error)
        return AgentRunStreamSessionV1(
            run_id=scope.run_id,
            start_sequence=start_sequence,
            last_sequence=scope.last_sequence,
            terminal=scope.terminal,
        )

    async def iter_sse(
        self,
        *,
        session: AgentRunStreamSessionV1,
        is_disconnected: Callable[[], Awaitable[bool]],
    ) -> AsyncIterator[bytes]:
        sequence = session.start_sequence
        keepalive_at = monotonic() + _SSE_KEEPALIVE_INTERVAL_SECONDS
        while True:
            events = await self._stream_repository.list_after(run_id=session.run_id, sequence=sequence)
            for event in events:
                sequence = event.sequence
                yield self._frame(cursor=event.cursor, payload=event.payload)
                if event.payload.get("type") in _TERMINAL_EVENT_TYPES:
                    return
            if session.terminal and sequence >= session.last_sequence:
                return
            if await is_disconnected():
                return
            now = monotonic()
            if now >= keepalive_at:
                yield b": keepalive\n\n"
                keepalive_at = now + _SSE_KEEPALIVE_INTERVAL_SECONDS
            await asyncio.sleep(_SSE_POLL_INTERVAL_SECONDS)

    async def _resolve_scope(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        run_id: UUID,
    ) -> AgentRunOwnedScopeV1:
        try:
            return await self._stream_repository.resolve_owned_scope(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                run_id=run_id,
            )
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)

    async def _snapshot(self, scope: AgentRunOwnedScopeV1) -> AgentRunSnapshotV1:
        try:
            return await self._snapshot_repository.get(
                scope=AgentRunSnapshotScopeV1(
                    workspace_id=scope.workspace_id,
                    project_id=scope.project_id,
                    thread_id=scope.thread_id,
                    run_id=scope.run_id,
                    owner_user_id=scope.owner_user_id,
                )
            )
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)

    async def _raise_cursor_expired(self, scope: AgentRunOwnedScopeV1) -> NoReturn:
        snapshot = await self._snapshot(scope)
        workspace_id = encode_uuid(scope.workspace_id)
        run_id = encode_uuid(scope.run_id)
        raise APIError(
            message=t("errors", "EVENT_CURSOR_EXPIRED"),
            error="EVENT_CURSOR_EXPIRED",
            status_code=410,
            meta={
                "snapshotUrl": f"/api/v1/workspaces/{workspace_id}/ai/runs/{run_id}",
                "snapshot": snapshot.model_dump(by_alias=True, mode="json"),
                "minimumReplaySequence": scope.minimum_replay_sequence,
                "minimumReplayCursor": scope.minimum_replay_cursor,
                "lastSequence": scope.last_sequence,
                "lastCursor": scope.last_cursor,
            },
        )

    @staticmethod
    def _select_cursor(*, query_cursor: str | None, last_event_id: str | None) -> str | None:
        query = AgentRunStreamService._normalize_cursor(query_cursor)
        header = AgentRunStreamService._normalize_cursor(last_event_id)
        if query is not None and header is not None and query != header:
            raise BadRequest(
                error="AGENT_RUN_CURSOR_CONFLICT",
                message=t("errors", "AGENT_RUN_CURSOR_CONFLICT"),
            )
        return query or header

    @staticmethod
    def _normalize_cursor(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized or len(normalized) > 512:
            raise BadRequest(
                error="AGENT_RUN_CURSOR_INVALID",
                message=t("errors", "AGENT_RUN_CURSOR_INVALID"),
            )
        return normalized

    @staticmethod
    def _frame(*, cursor: str, payload: JsonObject) -> bytes:
        data = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        return f"id: {cursor}\nevent: agent.run.event\ndata: {data}\n\n".encode()

    @staticmethod
    def _raise_http(error: AgentRuntimePersistenceError) -> NoReturn:
        if error.code in {"AGENT_RUN_NOT_FOUND", "AGENT_THREAD_NOT_FOUND"}:
            raise NotFound(
                error="AGENT_RUN_NOT_FOUND",
                message=t("errors", "AGENT_RUN_NOT_FOUND"),
            ) from error
        if error.code == "AGENT_RUN_CURSOR_INVALID":
            raise BadRequest(error=error.code, message=t("errors", error.code)) from error
        raise error
