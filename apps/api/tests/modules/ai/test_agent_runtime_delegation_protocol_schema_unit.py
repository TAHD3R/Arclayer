from __future__ import annotations

from typing import cast

import pytest
from pydantic import ValidationError

from src.common.types.json_types import JsonObject
from src.modules.ai.runtime_delegation_protocol_schema import (
    DelegationCompletedEventV1,
    DelegationDelegatedEventV1,
)


def _event(event_type: str, data: dict[str, object]) -> dict[str, object]:
    return {
        "eventVersion": 1,
        "eventId": "event-delegation-1",
        "cursor": "cursor-delegation-1",
        "type": event_type,
        "runId": "3dc77f5d-0381-4857-9c17-7b660b7fc14a",
        "threadId": "f63178b3-8c99-4a77-9614-797320e7b028",
        "sequence": 4,
        "occurredAt": "2026-07-19T06:00:04.000Z",
        "correlationId": "correlation-delegation",
        "spanId": "span-delegation",
        "parentSpanId": "span-tool",
        "data": data,
    }


def test_delegation_events_require_spans_and_sanitized_terminal_payloads() -> None:
    delegated_raw = _event(
        "delegation.delegated",
        {
            "delegationId": "delegation-1",
            "parentToolCallId": "tool-call-delegate-1",
            "childRunId": "bf86a15a-4f5e-4cd5-9b14-c59f6c937b69",
            "sourceAgentVersionId": "agent-version-lead",
            "targetAgentVersionId": "agent-version-analyst",
            "delegatedAt": "2026-07-19T06:00:04.000Z",
            "objectiveSummary": "Analyze conversion data.",
        },
    )
    completed_raw = _event(
        "delegation.completed",
        {
            "delegationId": "delegation-1",
            "childRunId": "bf86a15a-4f5e-4cd5-9b14-c59f6c937b69",
            "completedAt": "2026-07-19T06:01:00.000Z",
            "artifactRefs": [{"artifactId": "artifact-analysis-1"}],
            "summary": "Conversion analysis completed.",
        },
    )
    assert DelegationDelegatedEventV1.model_validate(delegated_raw).data.objective_summary
    assert DelegationCompletedEventV1.model_validate(completed_raw).data.artifact_refs
    with pytest.raises(ValidationError):
        DelegationDelegatedEventV1.model_validate({**delegated_raw, "spanId": None})
    with pytest.raises(ValidationError):
        DelegationCompletedEventV1.model_validate({
            **completed_raw,
            "data": {**cast(JsonObject, completed_raw["data"]), "rawChildPayload": {"secret": True}},
        })
