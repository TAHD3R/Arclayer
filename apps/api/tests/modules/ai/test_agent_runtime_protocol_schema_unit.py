from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.modules.ai.runtime_protocol_schema import (
    MessagePartCompletedEventV1,
    MessagePartDeltaEventV1,
    MessagePartStartedEventV1,
    RunCancelRequestedEventV1,
    RunCreatedEventV1,
    RunStartedEventV1,
)
from src.modules.ai.runtime_tool_protocol_schema import (
    ToolCompletedEventV1,
    ToolCompletedInlineDataV1,
    ToolFailedEventV1,
    ToolProgressEventV1,
    ToolStartedEventV1,
)


def _run_created_event() -> dict[str, object]:
    return {
        "eventVersion": 1,
        "eventId": "event-1",
        "cursor": "cursor-1",
        "type": "run.created",
        "runId": "run-1",
        "threadId": "thread-1",
        "sequence": 1,
        "occurredAt": "2026-07-18T12:00:00.000Z",
        "correlationId": "correlation-1",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "run": {
                "status": "created",
                "executionMode": "build",
                "leadAgentId": "agent-lead",
                "createdAt": "2026-07-18T12:00:00.000Z",
            }
        },
    }


def test_run_created_event_v1_validates_strict_public_envelope_and_payload() -> None:
    event = RunCreatedEventV1.model_validate(_run_created_event())

    assert event.event_version == 1
    assert event.sequence == 1
    assert event.data.run.execution_mode == "build"
    assert event.model_dump(by_alias=True, mode="json")["type"] == "run.created"

    for mutation in (
        {"eventVersion": 2},
        {"secret": "must-not-pass"},
        {"occurredAt": "2026-07-18T12:00:00+08:00"},
        {"data": {"run": {"status": "created"}}},
    ):
        invalid = {**_run_created_event(), **mutation}
        with pytest.raises(ValidationError):
            RunCreatedEventV1.model_validate(invalid)


def test_run_started_event_v1_requires_utc_time_positive_attempt_and_agent_version() -> None:
    raw = {
        **_run_created_event(),
        "type": "run.started",
        "sequence": 3,
        "data": {
            "startedAt": "2026-07-18T12:00:02.000Z",
            "attemptNumber": 1,
            "agentVersionId": "agent-version-lead",
        },
    }

    event = RunStartedEventV1.model_validate(raw)

    assert event.data.attempt_number == 1
    assert event.data.agent_version_id == "agent-version-lead"
    for data in (
        {**raw["data"], "attemptNumber": 0},
        {**raw["data"], "agentVersionId": ""},
        {**raw["data"], "startedAt": "2026-07-18T20:00:02+08:00"},
        {**raw["data"], "workerQueueName": "private-internal-name"},
    ):
        with pytest.raises(ValidationError):
            RunStartedEventV1.model_validate({**raw, "data": data})


def test_run_cancel_requested_event_v1_requires_utc_time_and_requesting_actor() -> None:
    raw = {
        **_run_created_event(),
        "type": "run.cancel.requested",
        "sequence": 4,
        "data": {
            "requestedAt": "2026-07-18T12:00:03.000Z",
            "requestedByActorId": "actor-owner",
        },
    }

    event = RunCancelRequestedEventV1.model_validate(raw)

    assert event.data.requested_by_actor_id == "actor-owner"
    for data in (
        {**raw["data"], "requestedByActorId": ""},
        {**raw["data"], "requestedAt": "2026-07-18T20:00:03+08:00"},
        {**raw["data"], "reason": "unspecified-private-reason"},
    ):
        with pytest.raises(ValidationError):
            RunCancelRequestedEventV1.model_validate({**raw, "data": data})


def test_text_message_part_events_validate_shell_delta_and_completion_snapshot() -> None:
    started_raw = {
        **_run_created_event(),
        "type": "message.part.started",
        "sequence": 5,
        "data": {
            "message": {
                "messageId": "message-lead",
                "role": "assistant",
                "agentId": "agent-lead",
                "createdAt": "2026-07-18T12:00:04.000Z",
                "placement": {"kind": "thread"},
            },
            "part": {
                "partId": "part-text",
                "partIndex": 0,
                "type": "text",
                "status": "running",
                "text": "",
            },
        },
    }
    delta_raw = {
        **_run_created_event(),
        "type": "message.part.delta",
        "sequence": 6,
        "data": {
            "messageId": "message-lead",
            "partId": "part-text",
            "delta": {"kind": "text.append", "text": "Hello"},
        },
    }
    completed_raw = {
        **_run_created_event(),
        "type": "message.part.completed",
        "sequence": 7,
        "data": {
            "messageId": "message-lead",
            "part": {
                "partId": "part-text",
                "partIndex": 0,
                "type": "text",
                "status": "complete",
                "text": "Hello",
            },
        },
    }

    started = MessagePartStartedEventV1.model_validate(started_raw)
    delta = MessagePartDeltaEventV1.model_validate(delta_raw)
    completed = MessagePartCompletedEventV1.model_validate(completed_raw)

    assert started.data.message.placement.kind == "thread"
    assert started.data.part.part_index == 0
    assert delta.data.delta.text == "Hello"
    assert completed.data.part.status == "complete"
    spaced_delta = MessagePartDeltaEventV1.model_validate({
        **delta_raw,
        "data": {**delta_raw["data"], "delta": {"kind": "text.append", "text": " world "}},
    })
    assert spaced_delta.data.delta.text == " world "

    invalid_started = {
        **started_raw,
        "data": {
            **started_raw["data"],
            "message": {
                **started_raw["data"]["message"],
                "placement": {"kind": "delegation", "delegationId": "delegation-1"},
            },
        },
    }
    invalid_delta = {
        **delta_raw,
        "data": {**delta_raw["data"], "delta": {"kind": "text.replace", "text": "Hello"}},
    }
    invalid_completed = {
        **completed_raw,
        "data": {
            **completed_raw["data"],
            "part": {**completed_raw["data"]["part"], "status": "running"},
        },
    }
    for schema, raw in (
        (MessagePartStartedEventV1, invalid_started),
        (MessagePartDeltaEventV1, invalid_delta),
        (MessagePartCompletedEventV1, invalid_completed),
    ):
        with pytest.raises(ValidationError):
            schema.model_validate(raw)


def test_tool_events_require_spans_canonical_args_and_sanitized_outcomes() -> None:
    envelope = {
        **_run_created_event(),
        "spanId": "span-tool-1",
        "parentSpanId": "span-run-1",
    }
    started_raw = {
        **envelope,
        "type": "tool.started",
        "sequence": 8,
        "data": {
            "messageId": "message-lead",
            "partId": "part-tool",
            "toolCallId": "tool-call-1",
            "toolId": "tool-content-query",
            "toolVersion": "v1",
            "toolName": "content.query",
            "args": {"limit": 2, "query": "pricing"},
            "argsText": '{"limit":2,"query":"pricing"}',
            "startedAt": "2026-07-18T12:00:07.000Z",
        },
    }
    progress_raw = {
        **envelope,
        "type": "tool.progress",
        "sequence": 9,
        "data": {
            "toolCallId": "tool-call-1",
            "progress": {
                "messageKey": "agents.tools.contentQuery.searching",
                "messageParams": {"collection": "pages"},
                "current": 1,
                "total": 2,
                "unit": "collections",
            },
        },
    }
    completed_raw = {
        **envelope,
        "type": "tool.completed",
        "sequence": 10,
        "data": {
            "toolCallId": "tool-call-1",
            "completedAt": "2026-07-18T12:00:08.000Z",
            "result": {"matchCount": 2},
            "artifactRefs": [{"artifactId": "artifact-query-results"}],
        },
    }
    failed_raw = {
        **envelope,
        "type": "tool.failed",
        "sequence": 10,
        "data": {
            "toolCallId": "tool-call-1",
            "failedAt": "2026-07-18T12:00:08.000Z",
            "error": {
                "code": "connector_unavailable",
                "message": "The publishing connector is unavailable.",
                "retryable": True,
                "details": {"connectorType": "stripe"},
            },
        },
    }

    started = ToolStartedEventV1.model_validate(started_raw)
    progress = ToolProgressEventV1.model_validate(progress_raw)
    completed = ToolCompletedEventV1.model_validate(completed_raw)
    failed = ToolFailedEventV1.model_validate(failed_raw)

    assert started.data.args_text == '{"limit":2,"query":"pricing"}'
    assert progress.data.progress.current == 1
    assert isinstance(completed.data, ToolCompletedInlineDataV1)
    assert completed.data.result == {"matchCount": 2}
    assert failed.data.error.retryable is True

    invalid_events = (
        (ToolStartedEventV1, {**started_raw, "spanId": None}),
        (
            ToolStartedEventV1,
            {**started_raw, "data": {**started_raw["data"], "argsText": '{"query":"pricing","limit":2}'}},
        ),
        (
            ToolProgressEventV1,
            {
                **progress_raw,
                "data": {
                    **progress_raw["data"],
                    "progress": {**progress_raw["data"]["progress"], "current": -1},
                },
            },
        ),
        (
            ToolCompletedEventV1,
            {**completed_raw, "data": {**completed_raw["data"], "resultRef": "result-ref-1"}},
        ),
        (
            ToolFailedEventV1,
            {
                **failed_raw,
                "data": {
                    **failed_raw["data"],
                    "error": {**failed_raw["data"]["error"], "stackTrace": "private stack"},
                },
            },
        ),
    )
    for schema, raw in invalid_events:
        with pytest.raises(ValidationError):
            schema.model_validate(raw)
