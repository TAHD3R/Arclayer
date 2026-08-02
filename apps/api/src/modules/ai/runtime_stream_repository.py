from __future__ import annotations

from copy import deepcopy
from typing import cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import AgentRunEventV1Record, AgentRunStatusV1, AgentRunV1Record, AgentThreadV1Record
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_repository_schema import PersistedAgentRunEvent
from src.modules.ai.runtime_stream_schema import AgentRunOwnedScopeV1

_TERMINAL_STATUSES = {
    AgentRunStatusV1.COMPLETED,
    AgentRunStatusV1.CANCELLED,
    AgentRunStatusV1.FAILED,
}

_UUID_FIELD_PATHS_BY_EVENT: dict[str, tuple[tuple[str, ...], ...]] = {
    "run.created": (),
    "run.queued": (),
    "run.recovery.requested": (
        ("data", "recoveryId"),
        ("data", "sourceJobId"),
        ("data", "recoveryJobId"),
    ),
    "run.started": (),
    "run.cancel.requested": (("data", "requestedByActorId"),),
    "message.part.started": (
        ("data", "message", "messageId"),
        ("data", "part", "partId"),
    ),
    "message.part.delta": (
        ("data", "messageId"),
        ("data", "partId"),
    ),
    "message.part.completed": (
        ("data", "messageId"),
        ("data", "part", "partId"),
    ),
    "tool.started": (
        ("data", "messageId"),
        ("data", "partId"),
    ),
    "tool.progress": (),
    "tool.completed": (),
    "tool.failed": (),
    "approval.required": (
        ("data", "messageId"),
        ("data", "partId"),
    ),
    "approval.resolved": (("data", "resolvedByActorId"),),
    "run.interrupted": (),
    "run.resumed": (),
    "delegation.delegated": (("data", "childRunId"),),
    "delegation.completed": (("data", "childRunId"),),
    "delegation.failed": (("data", "childRunId"),),
    "changeset.proposed": (),
    "usage.updated": (),
    "run.completed": (("data", "assistantMessageId"),),
    "run.cancelled": (),
    "run.failed": (),
}
_UUID_ARRAY_PATHS_BY_EVENT: dict[str, tuple[tuple[str, ...], ...]] = {
    "run.cancelled": (("data", "incompletePartIds"),),
    "run.failed": (("data", "incompletePartIds"),),
}


def project_public_agent_event(payload: JsonObject) -> JsonObject:
    """Project internal raw UUID references into the public SSE transport contract."""

    projected = deepcopy(payload)
    event_type = _required_string(projected, ("type",))
    event_paths = _UUID_FIELD_PATHS_BY_EVENT.get(event_type)
    if event_paths is None:
        raise AgentRuntimePersistenceError("AGENT_EVENT_TYPE_UNSUPPORTED")
    for path in (("runId",), ("threadId",), *event_paths):
        _encode_uuid_field(projected, path)
    for path in _UUID_ARRAY_PATHS_BY_EVENT.get(event_type, ()):
        _encode_uuid_array(projected, path)
    if event_type == "message.part.started":
        _project_message_identity(projected)
    return projected


def _project_message_identity(payload: JsonObject) -> None:
    message = _required_object(payload, ("data", "message"))
    actor_user_id = message.get("actorUserId")
    if actor_user_id is not None:
        _encode_uuid_field(payload, ("data", "message", "actorUserId"))
    placement = _required_object(payload, ("data", "message", "placement"))
    if placement.get("kind") == "delegation":
        _encode_uuid_field(payload, ("data", "message", "placement", "sourceRunId"))


def _encode_uuid_field(payload: JsonObject, path: tuple[str, ...]) -> None:
    container, field = _parent(payload, path)
    value = container.get(field)
    if not isinstance(value, str):
        raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID")
    try:
        container[field] = encode_uuid(UUID(value))
    except ValueError as error:
        raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID") from error


def _encode_uuid_array(payload: JsonObject, path: tuple[str, ...]) -> None:
    container, field = _parent(payload, path)
    values = container.get(field)
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID")
    try:
        container[field] = [encode_uuid(UUID(cast(str, value))) for value in values]
    except ValueError as error:
        raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID") from error


def _required_string(payload: JsonObject, path: tuple[str, ...]) -> str:
    container, field = _parent(payload, path)
    value = container.get(field)
    if not isinstance(value, str) or not value:
        raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID")
    return value


def _required_object(payload: JsonObject, path: tuple[str, ...]) -> JsonObject:
    value: object = payload
    for field in path:
        if not isinstance(value, dict):
            raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID")
        value = value.get(field)
    if not isinstance(value, dict):
        raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID")
    return cast(JsonObject, value)


def _parent(payload: JsonObject, path: tuple[str, ...]) -> tuple[JsonObject, str]:
    if not path:
        raise AgentRuntimePersistenceError("AGENT_EVENT_PAYLOAD_INVALID")
    return _required_object(payload, path[:-1]), path[-1]


class AgentRunStreamRepository(TortoiseORMRepository[AgentRunEventV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentRunEventV1Record)

    async def resolve_owned_scope(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        run_id: UUID,
    ) -> AgentRunOwnedScopeV1:
        run = await AgentRunV1Record.filter(
            id=run_id,
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
        ).first()
        if run is None or run.last_sequence < 1 or run.last_cursor is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        thread_exists = await AgentThreadV1Record.filter(
            id=run.thread_id,
            workspace_id=workspace_id,
            project_id=run.project_id,
            owner_user_id=owner_user_id,
            deleted_at=None,
        ).exists()
        if not thread_exists:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        return AgentRunOwnedScopeV1(
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            thread_id=run.thread_id,
            run_id=run.id,
            owner_user_id=run.owner_user_id,
            last_sequence=run.last_sequence,
            last_cursor=run.last_cursor,
            minimum_replay_sequence=run.minimum_replay_sequence,
            minimum_replay_cursor=run.minimum_replay_cursor,
            terminal=run.status in _TERMINAL_STATUSES,
        )

    async def resolve_cursor_sequence(
        self,
        *,
        scope: AgentRunOwnedScopeV1,
        cursor: str | None,
    ) -> int:
        if cursor is None:
            if scope.minimum_replay_sequence > 1:
                raise AgentRuntimePersistenceError("EVENT_CURSOR_EXPIRED")
            return 0
        if cursor == scope.minimum_replay_cursor:
            return scope.minimum_replay_sequence - 1
        event = await AgentRunEventV1Record.filter(run_id=scope.run_id, cursor=cursor).first()
        if event is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_CURSOR_INVALID")
        if event.sequence < scope.minimum_replay_sequence - 1:
            raise AgentRuntimePersistenceError("EVENT_CURSOR_EXPIRED")
        return event.sequence

    async def list_after(self, *, run_id: UUID, sequence: int) -> tuple[PersistedAgentRunEvent, ...]:
        records = await AgentRunEventV1Record.filter(run_id=run_id, sequence__gt=sequence).order_by("sequence")
        return tuple(
            PersistedAgentRunEvent(
                event_id=record.event_id,
                sequence=record.sequence,
                cursor=record.cursor,
                payload=project_public_agent_event(cast(JsonObject, record.payload)),
            )
            for record in records
        )
