from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.modules.ai.runtime_output_protocol_schema import (
    RunCancelledEventV1,
    UsageUpdatedEventV1,
)


def _event(event_type: str, data: dict[str, object]) -> dict[str, object]:
    return {
        "eventVersion": 1,
        "eventId": "event-output-1",
        "cursor": "cursor-output-1",
        "type": event_type,
        "runId": "3dc77f5d-0381-4857-9c17-7b660b7fc14a",
        "threadId": "f63178b3-8c99-4a77-9614-797320e7b028",
        "sequence": 5,
        "occurredAt": "2026-07-19T06:00:05.000Z",
        "correlationId": "correlation-output",
        "spanId": None,
        "parentSpanId": None,
        "data": data,
    }


def test_usage_and_settlement_reject_estimates_and_inconsistent_totals() -> None:
    usage = {
        "provider": "openai",
        "model": "gpt-5",
        "inputTokens": 120,
        "outputTokens": 48,
        "totalTokens": 168,
        "providerCost": "0.0042",
        "currency": "USD",
        "credits": "4.2",
        "settlement": "provisional",
    }
    event = UsageUpdatedEventV1.model_validate(
        _event(
            "usage.updated",
            {
                "usage": usage,
                "providerOccurredAt": "2026-07-19T06:00:04.000Z",
            },
        )
    )
    assert event.data.usage.total_tokens == 168
    with pytest.raises(ValidationError):
        UsageUpdatedEventV1.model_validate(
            _event(
                "usage.updated",
                {
                    "usage": {**usage, "totalTokens": 999},
                    "providerOccurredAt": "2026-07-19T06:00:04.000Z",
                },
            )
        )
    with pytest.raises(ValidationError):
        UsageUpdatedEventV1.model_validate(
            _event(
                "usage.updated",
                {
                    "usage": {**usage, "settlement": "committed"},
                    "providerOccurredAt": "2026-07-19T06:00:04.000Z",
                },
            )
        )
    with pytest.raises(ValidationError):
        RunCancelledEventV1.model_validate(
            _event(
                "run.cancelled",
                {
                    "cancelledAt": "2026-07-19T06:00:05.000Z",
                    "reasonCode": "user_cancelled",
                    "incompletePartIds": [],
                    "settlement": {
                        "outcome": "released",
                        "usage": None,
                        "creditsCommitted": "1",
                        "creditsReleased": "9",
                    },
                },
            )
        )
